
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

export type QueryResult<Q extends Query<unknown, unknown>> = Q extends Query<infer Result, unknown> ? Result : never
export type QueryChange<Q extends Query<unknown, unknown>> = Q extends Query<unknown, infer Change> ? Change : never

export interface InternalChangeCallback<Change> {
	willChange(): void

	/** Returns a callback that is called during the normal post-transaction observe step */
	didChange(change: Change): () => void
}