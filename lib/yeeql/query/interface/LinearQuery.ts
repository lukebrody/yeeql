/* v8 ignore start */
import { TableSchema, Row, Primitives } from 'yeeql/table/Schema'
import {
	SubqueryChange,
	SubqueryGenerators,
	SubqueriesResults,
	SubqueriesPrimitiveResults,
} from 'yeeql/query/subquery'
import { Query } from 'yeeql/query/Query'

export type ResultRow<
	S extends TableSchema,
	Select extends keyof S,
	Q extends SubqueryGenerators<S>,
> = Readonly<Row<Pick<S, Select>>> & Readonly<SubqueriesResults<S, Q>>

export type PrimitiveResultRow<
	S extends TableSchema,
	Q extends SubqueryGenerators<S>,
> = Readonly<Row<Primitives<S>>> & Readonly<SubqueriesPrimitiveResults<S, Q>>

// Need separate `Readonly`s because TypeScript is weird about the subquery change
export type Change<
	S extends TableSchema,
	Select extends keyof S,
	Q extends SubqueryGenerators<S>,
> =
	| Readonly<{
			kind: 'add'
			row: ResultRow<S, Select, Q>
			newIndex: number
			type: 'add' | 'update'
	  }>
	| Readonly<{
			kind: 'remove'
			row: ResultRow<S, Select, Q>
			oldIndex: number
			type: 'delete' | 'update'
	  }>
	| Readonly<{
			kind: 'update'
			row: ResultRow<S, Select, Q>
			oldIndex: number
			newIndex: number
			oldValues: Partial<ResultRow<S, Select, Q>>
			type: 'update'
	  }>
	| {
			[K in keyof Q]: Readonly<{
				kind: 'subquery'
				row: ResultRow<S, Select, Q>
				oldIndex: number
				newIndex: number
				key: K
				change: SubqueryChange<S, Q[K]>
				type: 'update'
			}>
	  }[keyof Q]

export type LinearQuery<
	S extends TableSchema,
	Select extends keyof S,
	Q extends SubqueryGenerators<S>,
> = Query<
	ReadonlyArray<ResultRow<S, Select, Q>>,
	Change<S, Select, Q>,
	ReadonlyArray<PrimitiveResultRow<S, Q>>
>
/* v8 ignore stop */
