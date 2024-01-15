import { DefaultMap } from 'common/DefaultMap'
import { Query } from 'yeeql/query/Query'
import { TableSchema, Row } from 'yeeql/table/Schema'

export type SubqueryGenerator<
	S extends TableSchema,
	Q extends Query<unknown, unknown, unknown>,
> = (row: Row<S>) => Q

export type SubqueryGenerators<S extends TableSchema> = {
	[key: string]: SubqueryGenerator<S, Query<unknown, unknown, unknown>>
}

export type SubqueryResult<
	S extends TableSchema,
	Q extends SubqueryGenerator<S, Query<unknown, unknown, unknown>>,
> = Q extends SubqueryGenerator<S, Query<infer Result, unknown, unknown>>
	? Result
	: never

export type SubqueryPrimitiveResult<
	S extends TableSchema,
	Q extends SubqueryGenerator<S, Query<unknown, unknown, unknown>>,
> = Q extends SubqueryGenerator<S, Query<unknown, unknown, infer Result>>
	? Result
	: never

export type SubqueriesResults<
	S extends TableSchema,
	Q extends SubqueryGenerators<S>,
> = {
	[K in keyof Q]: SubqueryResult<S, Q[K]>
}

export type SubqueriesDependencies<
	S extends TableSchema,
	Q extends SubqueryGenerators<S>,
> = DefaultMap<keyof S, Set<keyof Q>>

export type SubqueryChange<
	S extends TableSchema,
	Q extends SubqueryGenerator<S, Query<unknown, unknown, unknown>>,
> = Q extends SubqueryGenerator<S, Query<unknown, infer Change, unknown>>
	? Change
	: never

export type SubqueriesPrimitiveResults<
	S extends TableSchema,
	Q extends SubqueryGenerators<S>,
> = {
	[K in keyof Q]: SubqueryPrimitiveResult<S, Q[K]>
}
