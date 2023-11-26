import { UUID } from '../common/UUID'
import { QueryRegistry, QueryRegistryEntry, addedOrRemoved } from './QueryRegistry'
import { LinearQuery, LinearQueryImpl } from './LinearQuery'
import { GroupedQuery, GroupedQueryImpl } from './GroupedQuery'
import { CountQuery, CountQueryImpl } from './CountQuery'
import { GroupedCountQuery, GroupedCountQueryImpl } from './GroupedCountQuery'
import { DefaultMap } from '../common/DefaultMap'
import { YMap, YEvent } from './YInterfaces'
import * as Y from 'yjs'
import { Query, QueryResult, QueryChange } from './Query'
import { Row, Primitives, Filter, TableSchema, SubqueryGenerators, SubqueriesResults } from './Schema'
import stringify from 'json-stable-stringify'
import { LinearQueryWithSubqueries, LinearQueryWithSubqueriesImpl } from './LinearQueryWithSubqueries'

type Sort<S extends TableSchema, Q extends SubqueryGenerators<S>> = (a: Row<Primitives<S>> & SubqueriesResults<S, Q>, b: Row<Primitives<S>> & SubqueriesResults<S, Q>) => number

function getSortSubqueriesColumns<S extends TableSchema, Q extends SubqueryGenerators<S>>(schema: S, sort: Sort<S, Q>, subqueries?: Q): Set<keyof S> {
	const result = new Set<keyof S>()
	const proxy = new Proxy({} as Row<S> & SubqueriesResults<S, Q>, {
		get(_, p) {
			if (!(p in schema) && (subqueries === undefined || !(p in subqueries))) {
				throw new Error(`unknown column '${p.toString()}' used in 'sort' comparator`)
			}
			if (p in schema) {
				result.add(p as keyof S)
			}
			return '0'
		},
	})
	
	sort(proxy, proxy)
	
	if (subqueries !== undefined) {
		for(const subquery of Object.values(subqueries)) {
			subquery(proxy)
		}
	}

	return result
}

const noSort = () => 0

export class Table<S extends TableSchema> {
	constructor(private readonly yTable: YMap<YMap<unknown>>, private readonly schema: S) {
		this.queryRegistry = new QueryRegistry(schema)

		this.items = new Map()
		yTable.forEach((value, key) => {
			this.items.set(key as UUID, this.mapValueToRow(key as UUID, value))
		})

		yTable.observeDeep((events: YEvent[]) => {
			const runAfterTransaction: (() => void)[] = []

			for (const event of events) {
				if (event.target === yTable) {
					for (const [key, { action }] of event.keys) {
						if (action === 'delete' || action === 'update') {
							const row = this.items.get(key as UUID)!
							this.items.delete(key as UUID)
							const queries = this.queryRegistry.queries(row, addedOrRemoved)
							queries.forEach(query => {
								query.preChange()
								query.doItemRemove(row)
								runAfterTransaction.push(query.postItemRemove(row, action))
							})
						}
						if (action === 'add' || action === 'update') {
							const row = this.mapValueToRow(key as UUID, yTable.get(key)!)
							this.items.set(key as UUID, row)
							const queries = this.queryRegistry.queries(row, addedOrRemoved)
							queries.forEach(query => {
								query.preChange()
								query.doItemAdd(row, undefined)
								runAfterTransaction.push(query.postItemAdd(row, action))
							})
						}
					}
				} else if (event.target.parent === yTable) {
					const id = event.path[event.path.length - 1] as UUID
					const row = this.items.get(id)!

					const changes: Partial<Row<S>> = {}
					this.patchRow(changes, event)

					const oldValues: Partial<Row<S>> = {}
					for (const [key, { oldValue }] of event.keys) {
						oldValues[key as keyof Row<S>] = oldValue
					}

					// Query `filter` should be a subset of `select` since we're querying on changes, and filter params may have changed
					const beforeQueries = this.queryRegistry.queries(row, changes)

					for (const beforeQuery of beforeQueries) {
						beforeQuery.preChange()
						beforeQuery.doItemRemove(row)
					}

					this.patchRow(row, event)

					const afterQueries = this.queryRegistry.queries(row, changes)

					for (const afterQuery of afterQueries) {
						if (!beforeQueries.has(afterQuery)) {
							afterQuery.preChange()
						}
						afterQuery.doItemAdd(row, oldValues)
						if (!beforeQueries.has(afterQuery)) {
							runAfterTransaction.push(afterQuery.postItemAdd(row, 'update'))
						}
					}

					for (const beforeQuery of beforeQueries) {
						if (afterQueries.has(beforeQuery)) {
							runAfterTransaction.push(beforeQuery.postItemChange(row, oldValues))
						} else {
							runAfterTransaction.push(beforeQuery.postItemRemove(row, 'update'))
						}
					}
				}
			}

			yTable.doc!.once('afterTransaction', () => {
				runAfterTransaction.forEach(callback => callback())
			})
		})
	}

	private patchRow(row: Partial<Row<S>>, event: YEvent) {
		for (const [key] of event.keys) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			row[key as keyof Row<S>] = event.target.get(key)! as any
		}
	}

	private readonly queryRegistry: QueryRegistry<S>

	private readonly items: Map<UUID, Row<S>>

	private mapValueToRow(id: UUID, yMap: YMap<unknown>): Row<S> {
		const result: { [key: string]: unknown } = { id }
		for (const key of Object.keys(this.schema)) {
			if (key !== 'id') {
				result[key] = yMap.get(key)
			}
		}
		return result as Row<S>
	}

	// TODO: Use finalization to keep the cache clean
	private readonly queryCache = new DefaultMap<string, Map<object | null, Map<object | undefined | null, WeakRef<Query<unknown, unknown>>>>>(() => new Map())

	private getCachedQuery<Q extends Query<QueryResult<Q>, QueryChange<Q>> & QueryRegistryEntry<S>>(
		key: string,
		sort: object | null,
		subqueries: object | null,
		makeQuery: () => Q
	): Q {
		const cached = this.queryCache.get(key).get(sort)?.get(subqueries)?.deref()
		if (cached) {
			return cached as Q
		} else {
			const result = makeQuery()
			this.queryCache.get(key).set(sort, new Map())
			this.queryCache.get(key).get(sort)!.set(subqueries, new WeakRef(result))
			this.queryRegistry.register(result)
			return result
		}
	}

	private validateColumns(cols: Array<keyof S>) {
		const uknownCol = cols.find(col => this.schema[col] === undefined)
		if (uknownCol !== undefined) {
			throw new Error(`unknown column '${uknownCol.toString()}'`)
		}
	}

	query({ filter = {}, sort = noSort }: {
		filter?: Filter<S>,
		sort?: Sort<S, {}>
	}): LinearQuery<Row<S>>;
	query<Select extends keyof S>({ filter = {}, select, sort = noSort }: {
		select: ReadonlyArray<Select>,
		filter?: Filter<S>,
		sort?: Sort<S, {}>
	}): LinearQuery<Row<Pick<S, Select>>>;
	query<Select extends keyof S, Q extends SubqueryGenerators<S>>({ filter = {}, select, sort = noSort }: {
		select?: ReadonlyArray<Select>,
		filter?: Filter<S>,
		sort?: Sort<S, {}>,
		subqueries: SubqueryGenerators<S>
	}): LinearQueryWithSubqueries<S, Select, Q>;
	query<GroupBy extends keyof Primitives<S>>({ filter = {}, sort = noSort, groupBy }: {
		filter?: Filter<S>,
		sort?: Sort<S, {}>,
		groupBy: GroupBy
	}): GroupedQuery<Row<S>, Row<Primitives<S>>[GroupBy]>;
	query<Select extends keyof S, GroupBy extends keyof Primitives<S>>({ filter = {}, select, sort = noSort, groupBy }: {
		select: ReadonlyArray<Select>,
		filter?: Filter<S>,
		sort?: Sort<S, {}>,
		groupBy: GroupBy
	}): GroupedQuery<Row<Pick<S, Select>>, Row<Primitives<S>>[GroupBy]>;
	query<Select extends keyof S, GroupBy extends keyof Primitives<S>, Q extends SubqueryGenerators<S>>({ filter = {}, select, sort = noSort, groupBy, subqueries }: {
		select?: ReadonlyArray<Select>,
		filter?: Filter<S>,
		sort?: Sort<S, Q>,
		groupBy?: GroupBy,
		subqueries?: Q
	}): LinearQuery<Row<Pick<S, Select>>> | GroupedQuery<Row<Pick<S, Select>>, Row<Primitives<S>>[GroupBy]> | LinearQueryWithSubqueries<S, Select, Q> {

		this.validateColumns([...(select ?? []), ...(groupBy !== undefined ? [groupBy] : []), ...Object.keys(filter)])

		const resolvedSelect = Array.from(new Set([
			...(select ?? Object.keys(this.schema)),
			...getSortSubqueriesColumns(this.schema, sort, subqueries)
		])).sort() as unknown as ReadonlyArray<Select>

		let result: LinearQueryImpl<S, Select> | GroupedQueryImpl<S, Select, GroupBy> | LinearQueryWithSubqueriesImpl<S, Select, Q>
		if (groupBy === undefined) {
			if (subqueries === undefined) {
				result = this.getCachedQuery(
					stringify({ filter, resolvedSelect, kind: 'linear' }), sort, null,
					() => new LinearQueryImpl<S, Select>(this.items, resolvedSelect, filter, this.makeTiebrokenIdSort(sort as Sort<S, {}>))
				)
			} else {
				result = this.getCachedQuery(
					stringify({ filter, resolvedSelect, kind: 'linearSubqueries' }), sort, subqueries,
					() => new LinearQueryWithSubqueriesImpl<S, Select, Q>(this.items, resolvedSelect, filter, this.makeTiebrokenIdSort(sort), subqueries)
				)
			}
		} else {
			result = this.getCachedQuery(
				stringify({ filter, resolvedSelect, groupBy, kind: 'grouped' }), sort, null,
				() => new GroupedQueryImpl(this.items, resolvedSelect, filter, this.makeTiebrokenIdSort(sort as Sort<S, {}>), groupBy)
			)
		}
		return result
	}

	count({ filter = {} }: { filter?: Filter<S> }): CountQuery;
	count<GroupBy extends keyof Primitives<S>>({ filter = {}, groupBy }: { filter?: Filter<S>, groupBy: GroupBy }): GroupedCountQuery<Row<S>[GroupBy]>;
	count<GroupBy extends keyof Primitives<S>>({ filter = {}, groupBy }: { filter?: Filter<S>, groupBy?: GroupBy }): CountQuery | GroupedCountQuery<Row<S>[GroupBy]> {

		this.validateColumns([...(groupBy !== undefined ? [groupBy] : []), ...Object.keys(filter)])

		let result: CountQueryImpl<S> | GroupedCountQueryImpl<S, GroupBy>
		if (groupBy === undefined) {
			result = this.getCachedQuery(
				stringify({ filter, kind: 'count' }), null, null,
				() => new CountQueryImpl(this.items, filter)
			)
		} else {
			result = this.getCachedQuery(
				stringify({ filter, groupBy, kind: 'groupCount' }), null, null,
				() => new GroupedCountQueryImpl(this.items, filter, groupBy)
			)
		}
		this.queryRegistry.register(result)
		return result
	}

	insert(row: Omit<Row<S>, 'id'>): UUID {
		const id = UUID.create()
		this.yTable.set(id, new Y.Map(Object.entries(row)))
		return id
	}

	update<K extends Exclude<keyof S, 'id'> & string>(id: UUID, column: K, value: Row<S>[K]) {
		this.yTable.get(id)?.set(column, value)
	}

	delete(id: UUID) {
		this.yTable.delete(id)
	}
	
	private makeTiebrokenIdSort<T extends { id: UUID }>(comparator: (a: T, b: T) => number): (a: T, b: T) => number {
		return (a, b) => {
			const result = comparator(a, b)
			return result === 0 ? a.id.localeCompare(b.id) : result
		}
	}
}
