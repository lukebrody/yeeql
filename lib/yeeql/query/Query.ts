/**
 * The `PrimitiveResult` type is used when using the query's results in a `sort` function.
 * It should only include primitive values, e.g. values where yjs will inform yeeql when they change.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface Query<Result, Change, PrimitiveResult> {
	readonly result: Result
	observe(observer: (change: Change) => void): void
	unobserve(observer: (change: Change) => void): void
}

export type QueryResult<Q extends Query<unknown, unknown, unknown>> =
	Q extends Query<infer Result, unknown, unknown> ? Result : never

export type QueryChange<Q extends Query<unknown, unknown, unknown>> =
	Q extends Query<unknown, infer Change, unknown> ? Change : never

export type QueryPrimitiveResult<Q extends Query<unknown, unknown, unknown>> =
	Q extends Query<unknown, unknown, infer Result> ? Result : never
