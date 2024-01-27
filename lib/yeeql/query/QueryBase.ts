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
export interface QueryInternal<Change> {
	/**
	 * Observers here are called while the query is updating during a transaction.
	 * Use these hooks to perform updates during the transaction so that data may be in a consistent state when observers are called at the end of the transaction.
	 *
	 * For example, yeeql uses this mechanism internally to update subqueries.
	 *
	 * Call the returned function to remove
	 */
	internalObserve(callback: InternalChangeCallback<Change>): void
	internalUnobserve(callback: InternalChangeCallback<Change>): void
}

export abstract class QueryBase<Change> implements QueryInternal<Change> {
	private readonly observers = new Set<(change: Change) => void>()

	observe(observer: (change: Change) => void): void {
		this.observers.add(observer)
	}

	unobserve(observer: (change: Change) => void): void {
		this.observers.delete(observer)
	}

	private readonly internalObservers: Set<InternalChangeCallback<Change>> =
		new Set()

	internalObserve(callback: InternalChangeCallback<Change>): void {
		this.internalObservers.add(callback)
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
		const internalObservers = Array.from(this.internalObservers)
		const internalObserverNotifications: (() => void)[] = []

		let change: Change
		const callObserver = (i: number) => {
			if (i < internalObservers.length) {
				internalObserverNotifications.push(
					internalObservers[i](() => callObserver(i + 1)),
				)
			} else {
				change = doChange()
			}
			return change
		}

		callObserver(0)

		return () => {
			this.observers.forEach((callback) => callback(change))
			internalObserverNotifications.forEach((notify) => notify())
		}
	}
}
