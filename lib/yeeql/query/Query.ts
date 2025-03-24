/* c8 ignore next */
/**
 * The `PrimitiveResult` type is used when using the query's results in a `sort` function.
 * It should only include primitive values, e.g. values where yjs will inform yeeql when they change.
 */

import { MinimalQueryChange } from 'yeeql/query/QueryBase'

export interface Query<
	Result,
	Change extends MinimalQueryChange,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	PrimitiveResult,
> {
	readonly result: Result
	observe(observer: (change: Change) => void): void
	unobserve(observer: (change: Change) => void): void
}

export type QueryResult<Q extends Query<unknown, MinimalQueryChange, unknown>> =
	Q extends Query<infer Result, MinimalQueryChange, unknown> ? Result : never

export type QueryChange<Q extends Query<unknown, MinimalQueryChange, unknown>> =
	Q extends Query<unknown, infer Change, unknown> ? Change : never

export type QueryPrimitiveResult<
	Q extends Query<unknown, MinimalQueryChange, unknown>,
> = Q extends Query<unknown, MinimalQueryChange, infer Result> ? Result : never
