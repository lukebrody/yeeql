export interface Query<Result, Change> {
	readonly result: Result
	observe(observer: (change: Change) => void): void
	unobserve(observer: (change: Change) => void): void
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
