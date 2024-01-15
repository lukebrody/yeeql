import { TableSchema, Row } from 'yeeql/Schema'

type ResultRow<
	S extends TableSchema,
	Select extends keyof S,
	Q extends SubqueryGenerators<S>,
> = Readonly<Row<Pick<S, Select>>> & Readonly<SubqueriesResults<S, Q>>

export type LinearQueryChange<
	S extends TableSchema,
	Select extends keyof S,
	Q extends SubqueryGenerators<S>,
> =
	| {
			kind: 'add'
			row: ResultRow<S, Select, Q>
			newIndex: number
			type: 'add' | 'update'
	  }
	| {
			kind: 'remove'
			row: ResultRow<S, Select, Q>
			oldIndex: number
			type: 'delete' | 'update'
	  }
	| {
			kind: 'update'
			row: ResultRow<S, Select, Q>
			oldIndex: number
			newIndex: number
			oldValues: Partial<ResultRow<S, Select, Q>>
			type: 'update'
	  }
	| {
			[K in keyof Q]: {
				kind: 'subquery'
				row: ResultRow<S, Select, Q>
				oldIndex: number
				newIndex: number
				key: K
				change: SubqueryChange<S, Q[K]>
				type: 'update'
			}
	  }[keyof Q]

export type LinearQueryResult<
	S extends TableSchema,
	Select extends keyof S,
	Q extends SubqueryGenerators<S>,
> = ReadonlyArray<ResultRow<S, Select, Q>>

export type LinearQuery<
	S extends TableSchema,
	Select extends keyof S,
	Q extends SubqueryGenerators<S>,
> = Query<LinearQueryResult<S, Select, Q>, LinearQueryChange<S, Select, Q>>
