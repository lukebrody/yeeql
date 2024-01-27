import { Filter, Primitives, Row, TableSchema } from 'yeeql/table/Schema'
import { QueryRegistryEntry } from 'yeeql/table/QueryRegistry'
import { UUID } from 'common/UUID'
import { MapValue, ReadonlyDefaultMap } from 'common/DefaultMap'
import { Query, QueryChange, QueryResult } from 'yeeql/query/Query'
import {
	InternalChangeCallback,
	MinimalQueryChange,
	QueryBase,
	QueryInternal,
} from 'yeeql/query/QueryBase'
import { GroupedQuery } from 'yeeql/query/interface/GroupedQuery'

export class GroupedQueryImpl<
		S extends TableSchema,
		GroupBy extends keyof Primitives<S>,
		Q extends Query<unknown, MinimalQueryChange, unknown>,
	>
	extends QueryBase<QueryChange<GroupedQuery<S, GroupBy, Q>>>
	implements QueryRegistryEntry<S>, GroupedQuery<S, GroupBy, Q>
{
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		readonly filter: Filter<S>,
		readonly groupBy: GroupBy,
		readonly makeSubquery: (group: Row<Primitives<S>>[GroupBy]) => Q,
	) {
		super()
		this.queries = new Map()
		const queries = this.queries
		this.result = {
			get: (group) =>
				(queries.get(group)?.query.result ??
					makeSubquery(group).result) as QueryResult<Q>,
			forEach(callbackfn, thisArg) {
				queries.forEach(({ query }, group) =>
					callbackfn.bind(thisArg)(query.result as QueryResult<Q>, group, this),
				)
			},
			has: (group) => queries.has(group),
			get size() {
				return queries.size
			},
			entries() {
				const iterator = queries.entries()
				return {
					[Symbol.iterator]: () => this.entries(),
					next() {
						const { value, done } = iterator.next()
						if (done === true) {
							return { value: undefined, done: true }
						} else {
							return { value: [value[0], value[1].query.result], done: false }
						}
					},
				}
			},
			keys: () => queries.keys(),
			values() {
				const iterator = queries.values()
				return {
					[Symbol.iterator]: () => this.values(),
					next() {
						const { value, done } = iterator.next()
						return { value: value?.query.result, done }
					},
				}
			},
			[Symbol.iterator]: function () {
				return this.entries()
			},
		}
		this.select = new Set([groupBy])

		addItem: for (const [, row] of items) {
			for (const [key, value] of Object.entries(filter)) {
				if (row[key] !== value) {
					continue addItem
				}
			}
			const group = row[groupBy]
			const query = this.queries.get(group)
			if (!query) {
				this.addQuery(group)
			} else {
				query.refCount++
			}
		}
	}

	readonly select: ReadonlySet<keyof S>

	private readonly queries: Map<
		Row<S>[GroupBy],
		{
			query: Query<QueryResult<Q>, QueryChange<Q>, unknown> &
				QueryInternal<QueryChange<Q>>
			refCount: number
			observer: InternalChangeCallback<QueryChange<Q>>
		}
	>
	readonly result: ReadonlyDefaultMap<Row<S>[GroupBy], QueryResult<Q>>

	private addQuery(
		group: Row<S>[GroupBy],
	): MapValue<typeof this.queries>['query'] {
		const query = this.makeSubquery(group) as unknown as MapValue<
			typeof this.queries
		>['query']
		const observer: InternalChangeCallback<QueryChange<Q>> = (ready) => {
			return this.makeChange(() => {
				const change = ready()
				return {
					kind: 'subquery',
					result: query.result as QueryResult<Q>,
					group,
					change,
					type: change.type,
				}
			})
		}
		query.internalObserve(observer)
		this.queries.set(group, { query, refCount: 1, observer })
		return query
	}

	// If we ready-chain everything, we can get our subquery changes when we're creating a group
	// Things will need to be able to be added/removed *during* the yielding, as we'll be adding/removing subqueries
	// There can also be cyclic dependencies
	addRow(row: Row<S>, type: 'add' | 'update'): () => void {
		const group = row[this.groupBy]
		const query = this.queries.get(group)
		if (query) {
			query.refCount++
			return () => undefined
		} else {
			return this.makeChange(() => {
				const query = this.addQuery(group)
				return {
					kind: 'addGroup',
					group,
					type,
					result: query.result,
				}
			})
		}
	}

	removeRow(row: Row<S>, type: 'delete' | 'update'): () => void {
		const group = row[this.groupBy]
		const query = this.queries.get(group)!
		if (query.refCount === 1) {
			return this.makeChange(() => {
				query.query.internalUnobserve(query.observer)
				this.queries.delete(group)
				return {
					kind: 'removeGroup',
					group,
					result: query.query.result,
					type,
				}
			})
		} else {
			query.refCount--
			return () => undefined
		}
	}

	changeRow(
		row: Row<S>,
		oldValues: Readonly<Partial<Row<S>>>,
		newValues: Readonly<Partial<Row<S>>>,
		patch: (row: Row<S>) => void,
	): () => void {
		if (oldValues[this.groupBy] === newValues[this.groupBy]) {
			return () => undefined
		}

		const removeResult = this.removeRow(row, 'update')
		patch(row)
		const addResult = this.addRow(row, 'update')
		return () => {
			removeResult()
			addResult()
		}
	}
}
