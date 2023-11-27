export interface Query<Result, Change> {
	readonly result: Result
	observe(observer: (change: Change) => void): void
	unobserve(observer: (change: Change) => void): void

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

export type QueryResult<Q extends Query<unknown, unknown>> = Q extends Query<
	infer Result,
	unknown
>
	? Result
	: never
export type QueryChange<Q extends Query<unknown, unknown>> = Q extends Query<
	unknown,
	infer Change
>
	? Change
	: never

/** Callback used for queries that depend on other queries to
 * 1. Prepare for updates to the query they're subscribed to
 * 2. Call `ready` (required) so that other dependent queries can do this process
 * 3. Make their own modifications based on the new state of their dependency.
 * 4. Return a changes callback as part of the dependent's change callback.
 */
export type InternalChangeCallback<Change> = (ready: () => Change) => () => void
