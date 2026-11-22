/* c8 ignore next */
import { InvalidChange } from 'yeeql/query/Query'

export interface MinimalQueryChange {
	type: 'add' | 'update' | 'delete'
}

/** Callback used for queries that depend on other queries to
 * 1. Prepare for updates to the query they're subscribed to
 * 2. Call `ready` (required) so that other dependent queries can do this process
 * 3. Make their own modifications based on the new state of their dependency.
 * 4. Return a changes callback as part of the dependent's change callback.
 */
export type InternalChangeCallback<Change> = (ready: () => Change) => () => void
// Invalidates the observer when the query it observes becomes invalid
export type InvalidatedCallback = (error: unknown) => () => void
export interface QueryInternal<Change> {
	/**
	 * Observers here are called while the query is updating during a transaction.
	 * Use these hooks to perform updates during the transaction so that data may be in a consistent state when observers are called at the end of the transaction.
	 *
	 * For example, yeeql uses this mechanism internally to update subqueries.
	 *
	 * Call the returned function to remove
	 */
	internalObserve(
		callback: InternalChangeCallback<Change>,
		invalidated: InvalidatedCallback,
	): void
	internalUnobserve(callback: InternalChangeCallback<Change>): void
	// After `ready()`: false if that change was folded into an earlier one, so observers weren't told
	readonly changeReported: boolean
}

const dependencyInvalidated = Symbol()

export abstract class QueryBase<Change> implements QueryInternal<Change> {
	version = 0

	changeReported = true

	// Set once this query is invalid
	error: unknown = undefined

	// The Table sets this when it registers the query
	unregister = () => undefined

	private readonly observers = new Set<
		(change: Change | InvalidChange) => void
	>()

	observe(observer: (change: Change | InvalidChange) => void): void {
		this.observers.add(observer)
	}

	unobserve(observer: (change: Change | InvalidChange) => void): void {
		this.observers.delete(observer)
	}

	private readonly internalObservers = new Map<
		InternalChangeCallback<Change>,
		InvalidatedCallback
	>()

	internalObserve(
		callback: InternalChangeCallback<Change>,
		invalidated: InvalidatedCallback,
	): void {
		if (this.error !== undefined) {
			throw this.error
		}
		this.internalObservers.set(callback, invalidated)
	}

	internalUnobserve(callback: InternalChangeCallback<Change>): void {
		this.internalObservers.delete(callback)
	}

	/**
	 * Sequences updating this query's result with internal observers,
	 * so that internal observers can start executing based on the query's previous results,
	 * and signal by calling `ready()` that they are ready for this query's result to update.
	 *
	 * `ready` returns the change that was made
	 *
	 * An internal observer might look like
	 * ```
	 * query.internalObserve((ready) => {
	 *   // something with the old result
	 *   const change = ready()
	 *   // something with the new result
	 * })
	 * ```
	 *
	 * additionally, this method serves as a convenience for calling normal (external) observers
	 *
	 * @param doChange - updates this query's result
	 * @returns a function that sends notifications to observers
	 */
	protected notifyingObservers(doChange: () => Change): () => void {
		const internalObservers = this.internalObservers.keys()
		const internalObserverNotifications: (() => void)[] = []

		let change: Change
		let reported: boolean
		let invalidation: (() => void) | undefined
		const callObserver = () => {
			const next = internalObservers.next()
			if (next.done === undefined || next.done === false) {
				const callback = next.value
				try {
					internalObserverNotifications.push(
						callback(() => {
							const change = callObserver()
							// Another change may have invalidated the observer while it waited
							if (!this.internalObservers.has(callback)) {
								throw dependencyInvalidated
							}
							return change
						}),
					)
				} catch (error) {
					if (
						error !== dependencyInvalidated ||
						this.error !== undefined ||
						this.internalObservers.has(callback)
					) {
						throw error
					}
				}
			} else {
				this.changeReported = true
				try {
					change = doChange()
				} catch (error) {
					if (error === dependencyInvalidated) {
						throw error
					}
					queueMicrotask(() => {
						throw error
					})
					invalidation = this.invalidate(error)
					// Unwinds the internal observers waiting on `ready`, which are invalid now too
					throw dependencyInvalidated
				}
				reported = this.changeReported
				this.version++
			}
			return change
		}

		try {
			callObserver()
		} catch (error) {
			if (invalidation === undefined) {
				throw error
			}
			return invalidation
		}

		return () => {
			// Observers of a query invalidated later in the transaction only see 'invalid'
			if (reported && this.error === undefined) {
				this.notifyObservers(change)
			}
			internalObserverNotifications.forEach((notify) => notify())
		}
	}

	private notifyObservers(change: Change | InvalidChange) {
		this.observers.forEach((callback) => {
			try {
				callback(change)
			} catch (error) {
				// Throwing inside Yjs's afterTransaction would skip the remaining notifications
				queueMicrotask(() => {
					throw error
				})
			}
		})
	}

	protected unobserveDependencies(): void {
		// Overridden by queries that observe other queries
	}

	invalidate(error: unknown): () => void {
		this.error = error
		const throwError = () => {
			throw error
		}
		Object.defineProperty(this, 'result', { get: throwError })
		Object.defineProperty(this, 'version', { get: throwError })
		this.observe = throwError
		this.unobserveDependencies()
		this.unregister()
		const notifications = Array.from(
			this.internalObservers.values(),
			(invalidated) => invalidated(error),
		)
		return () => {
			this.notifyObservers({ kind: 'invalid', error, type: 'update' })
			notifications.forEach((notify) => notify())
		}
	}
	/* c8 ignore next */
}
