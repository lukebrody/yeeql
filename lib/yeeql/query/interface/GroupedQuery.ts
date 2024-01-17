import { ReadonlyDefaultMap } from 'common/DefaultMap'
import {
	Query,
	QueryChange,
	QueryPrimitiveResult,
	QueryResult,
} from 'yeeql/query/Query'
import { Primitives, Row, TableSchema } from 'yeeql/table/Schema'

export type GroupedQuery<
	S extends TableSchema,
	GroupBy extends keyof Primitives<S>,
	Q extends Query<unknown, unknown, unknown>,
> = Query<
	ReadonlyDefaultMap<Row<Primitives<S>>[GroupBy], QueryResult<Q>>,
	| Readonly<{
			kind: 'addGroup'
			group: Row<Primitives<S>>[GroupBy]
			result: QueryResult<Q>
			type: 'add' | 'update'
	  }>
	| Readonly<{
			kind: 'removeGroup'
			group: Row<Primitives<S>>[GroupBy]
			result: QueryResult<Q>
			type: 'delete' | 'update'
	  }>
	| Readonly<{
			kind: 'subquery'
			group: Row<Primitives<S>>[GroupBy]
			result: QueryResult<Q>
			change: QueryChange<Q>
			type: 'update'
	  }>,
	ReadonlyDefaultMap<Row<Primitives<S>>[GroupBy], QueryPrimitiveResult<Q>>
>
