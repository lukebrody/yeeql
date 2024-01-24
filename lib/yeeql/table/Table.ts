import stringify from 'json-stable-stringify'
import * as Y from 'yjs'
import { DefaultMap } from 'common/DefaultMap'
import { UUID } from 'common/UUID'
import { debug } from 'common/debug'
import { compareStrings } from 'common/string'
import { YEvent, YMap } from 'yeeql/YInterfaces'
import { Query, QueryChange, QueryResult } from 'yeeql/query/Query'
import { CountQuery } from 'yeeql/query/interface/CountQuery'
import { GroupedQuery } from 'yeeql/query/interface/GroupedQuery'
import {
	LinearQuery,
	ResultRow as LinearQueryResultRow,
} from 'yeeql/query/interface/LinearQuery'
import {
	QueryRegistry,
	QueryRegistryEntry,
	addedOrRemoved,
} from 'yeeql/table/QueryRegistry'
import {
	Filter,
	Primitives,
	Row,
	TableSchema,
	schemaToDebugString,
} from 'yeeql/table/Schema'
import {
	SubqueriesDependencies,
	SubqueriesPrimitiveResults,
	SubqueryGenerators,
} from 'yeeql/query/subquery'
import { LinearQueryWithoutSubqueriesImpl } from 'yeeql/query/implementation/LinearQueryWithoutSubqueriesImpl'
import { LinearQueryWithSubqueriesImpl } from 'yeeql/query/implementation/LinearQueryWithSubqueriesImpl'
import { GroupedQueryImpl } from 'yeeql/query/implementation/GroupedQueryImpl'
import { CountQueryImpl } from 'yeeql/query/implementation/CountQueryImpl'
import { MinimalQueryChange } from 'yeeql/query/QueryBase'

/*
 * We only allow the user to use primitives in their sort function,
 * as objects can change without updating yeeql and cause the sorted order to become invalid
 */
type Sort<S extends TableSchema, Q extends SubqueryGenerators<S>> = (
	a: Row<Primitives<S>> & SubqueriesPrimitiveResults<S, Q>,
	b: Row<Primitives<S>> & SubqueriesPrimitiveResults<S, Q>,
) => number

const stubProxy: unknown = new Proxy(() => undefined, {
	get(_, p) {
		if (p === Symbol.toPrimitive) {
			return () => '0'
		}
		return stubProxy
	},
	apply() {
		return stubProxy
	},
})

function getSortColumns<S extends TableSchema, Q extends SubqueryGenerators<S>>(
	schema: S,
	sort: Sort<S, Q>,
	subqueries?: Q,
): Set<keyof S> {
	const accessedKeys = new Set<keyof S>()
	const proxy = new Proxy({} as Row<S> & SubqueriesPrimitiveResults<S, Q>, {
		get(_, p) {
			if (!(p in schema) && (subqueries === undefined || !(p in subqueries))) {
				throw new Error(
					`unknown column '${p.toString()}' used in 'sort' comparator`,
				)
			}
			if (p in schema) {
				accessedKeys.add(p as keyof S)
				return '0'
			}
			return stubProxy
		},
	})

	sort(proxy, proxy)

	if (subqueries !== undefined) {
		for (const subquery of Object.values(subqueries)) {
			subquery(proxy)
		}
	}

	return accessedKeys
}

function makeSubqueriesProxy<S extends TableSchema>(
	schema: S,
): { proxy: Row<S>; accessedKeys: Set<keyof S> } {
	const accessedKeys = new Set<keyof S>()
	const proxy = new Proxy({} as Row<S>, {
		get(_, p) {
			if (!(p in schema)) {
				throw new Error(
					`unknown column '${p.toString()}' used in subquery generator`,
				)
			}
			if (p in schema) {
				accessedKeys.add(p as keyof S)
				return '0'
			}
			return stubProxy
		},
	})

	return { accessedKeys, proxy }
}

function getSubqueriesColumns<
	S extends TableSchema,
	Q extends SubqueryGenerators<S>,
>(schema: S, subqueries?: Q): Set<keyof S> {
	const { proxy, accessedKeys } = makeSubqueriesProxy(schema)
	if (subqueries) {
		for (const subquery of Object.values(subqueries)) {
			subquery(proxy)
		}
	}
	return accessedKeys
}

function getSubqueriesDependencies<
	S extends TableSchema,
	Q extends SubqueryGenerators<S>,
>(schema: S, subqueries: Q): SubqueriesDependencies<S, Q> {
	const result: SubqueriesDependencies<S, Q> = new DefaultMap(() => new Set())

	for (const [subqueryKey, subquery] of Object.entries(subqueries)) {
		const { proxy, accessedKeys } = makeSubqueriesProxy(schema)
		subquery(proxy)
		for (const accessedKey of accessedKeys) {
			result.get(accessedKey).add(subqueryKey)
		}
	}

	return result
}

const noSort = () => 0

type QueryCacheKey = {
	key: string
	sort: object | null
	subqueries: object | null
}

function makeTiebrokenIdSort<T extends { id: UUID }>(
	comparator: (a: T, b: T) => number,
): (a: T, b: T) => number {
	return (a, b) => {
		const result = comparator(a, b)
		if (result === 0) {
			return compareStrings(a.id, b.id)
		} else {
			return result
		}
	}
}

export class Table<S extends TableSchema> {
	constructor(
		private readonly yTable: YMap<YMap<unknown>>,
		private readonly schema: S,
		debugName?: string,
	) {
		this.debugName = debugName ?? `table${++debug.counter}`
		if (debug.on) {
			debug.statements.push(
				`const ${this.debugName} = new Table(ydoc.getMap('${
					this.debugName
				}'), ${schemaToDebugString(schema)}, '${this.debugName}')`,
			)
		}

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
							queries.forEach((query) => {
								runAfterTransaction.push(query.removeRow(row, action))
							})
						}
						if (action === 'add' || action === 'update') {
							const row = this.mapValueToRow(key as UUID, yTable.get(key)!)
							this.items.set(key as UUID, row)
							const queries = this.queryRegistry.queries(row, addedOrRemoved)
							queries.forEach((query) => {
								runAfterTransaction.push(query.addRow(row, action))
							})
						}
					}
				} else if (event.target.parent === yTable) {
					const id = event.path[event.path.length - 1] as UUID

					const row = this.items.get(id)!

					const oldValues: Partial<Row<S>> = {}
					const newValues: Partial<Row<S>> = {}

					for (const key of event.keys.keys() as IterableIterator<
						keyof Row<S>
					>) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const value = event.target.get(key)! as any
						oldValues[key] = row[key]
						newValues[key] = value
					}

					const patch = (row: Record<string, unknown>) =>
						Object.entries(newValues).forEach(
							([key, value]) => (row[key] = value),
						)

					const unpatch = (row: Record<string, unknown>) =>
						Object.entries(oldValues).forEach(
							([key, value]) => (row[key] = value),
						)

					// Query `filter` should be a subset of `select` since we're querying on changes, and filter params may have changed
					const beforeQueries = this.queryRegistry.queries(row, newValues)
					patch(row)
					const afterQueries = this.queryRegistry.queries(row, newValues)

					unpatch(row)
					for (const beforeQuery of beforeQueries) {
						if (!afterQueries.has(beforeQuery)) {
							runAfterTransaction.push(beforeQuery.removeRow(row, 'update'))
						}
					}

					patch(row)
					for (const afterQuery of afterQueries) {
						if (!beforeQueries.has(afterQuery)) {
							runAfterTransaction.push(afterQuery.addRow(row, 'update'))
						} else {
							unpatch(row)
							runAfterTransaction.push(
								afterQuery.changeRow(row, oldValues, newValues, patch),
							)
						}
					}
				}
			}

			yTable.doc!.once('afterTransaction', () => {
				runAfterTransaction.forEach((callback) => callback())
			})
		})
	}

	readonly debugName: string

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

	private readonly queryCache = new DefaultMap<
		string,
		DefaultMap<
			object | null,
			Map<object | null, WeakRef<Query<unknown, MinimalQueryChange, unknown>>>
		>
	>(() => new DefaultMap(() => new Map()))

	private readonly queryFinalizer = new FinalizationRegistry<QueryCacheKey>(
		({ key, sort, subqueries }) => {
			const layerOne = this.queryCache.get(key)
			const layerTwo = layerOne.get(sort)
			layerTwo.delete(subqueries)
			if (layerTwo.size === 0) {
				layerOne.delete(sort)
				if (layerOne.size === 0) {
					this.queryCache.delete(key)
				}
			}
		},
	)

	private getCachedQuery<
		Q extends Query<QueryResult<Q>, QueryChange<Q>, unknown> &
			QueryRegistryEntry<S>,
	>({ key, sort, subqueries }: QueryCacheKey, makeQuery: () => Q): Q {
		const cached = this.queryCache.get(key).get(sort).get(subqueries)?.deref()
		if (cached) {
			return cached as Q
		} else {
			const result = makeQuery()
			this.queryCache.get(key).get(sort).set(subqueries, new WeakRef(result))
			this.queryRegistry.register(result)
			this.queryFinalizer.register(result, { key, sort, subqueries })
			return result
		}
	}

	private validateColumns(cols: Array<keyof S>) {
		const uknownCol = cols.find((col) => this.schema[col] === undefined)
		if (uknownCol !== undefined) {
			throw new Error(`unknown column '${uknownCol.toString()}'`)
		}
	}

	query<Select extends keyof S>(_: {
		select?: ReadonlyArray<Select>
		filter?: Filter<S>
		subqueries?: undefined // Need this so TypeScript doesn't get confused??
		sort?: Sort<S, {}>
	}): LinearQuery<S, Select, {}>
	query<Select extends keyof S, Q extends SubqueryGenerators<S>>(_: {
		select?: ReadonlyArray<Select>
		filter?: Filter<S>
		subqueries: Q
		sort?: Sort<S, Q>
	}): LinearQuery<S, keyof S, Q>
	query<Select extends keyof S, GroupBy extends keyof Primitives<S>>(_: {
		select?: ReadonlyArray<Select>
		filter?: Filter<S>
		groupBy: GroupBy
		sort?: Sort<S, {}>
	}): GroupedQuery<S, GroupBy, LinearQuery<S, Select, {}>>
	query<
		Select extends keyof S,
		GroupBy extends keyof Primitives<S>,
		Q extends SubqueryGenerators<S>,
	>(_: {
		select?: ReadonlyArray<Select>
		filter?: Filter<S>
		groupBy: GroupBy
		subqueries: Q
		sort?: Sort<S, Q>
	}): GroupedQuery<S, GroupBy, LinearQuery<S, Select, Q>>
	query<
		Select extends keyof S,
		GroupBy extends keyof Primitives<S>,
		Q extends SubqueryGenerators<S>,
	>({
		filter = {},
		select,
		sort = noSort,
		groupBy,
		subqueries,
	}: {
		select?: ReadonlyArray<Select>
		filter?: Filter<S>
		sort?: Sort<S, Q>
		groupBy?: GroupBy
		subqueries?: Q
	}):
		| LinearQuery<S, Select, {}>
		| LinearQuery<S, Select, Q>
		| GroupedQuery<S, GroupBy, LinearQuery<S, Select, {}>>
		| GroupedQuery<S, GroupBy, LinearQuery<S, Select, Q>> {
		if (debug.on && !debug.makingSubquery) {
			let subqueriesString: string | undefined
			if (subqueries !== undefined) {
				subqueriesString = `{${Object.entries(subqueries)
					.map(([key, value]) => `${key}: ${value}`)
					.join(', ')}}`
			}
			debug.statements.push(
				`const query${++debug.counter} = ${
					this.debugName
				}.query({select: ${select}, filter: ${JSON.stringify(
					filter,
				)}, subqueries: ${subqueriesString}, sort: ${sort}, groupBy: ${JSON.stringify(
					groupBy,
				)}})`,
			)
		}

		this.validateColumns([
			...(select ?? []),
			...(groupBy !== undefined ? [groupBy] : []),
			...Object.keys(filter),
		])

		const resolvedSelect = Array.from(
			new Set([
				...(select ?? Object.keys(this.schema)),
				...getSortColumns(this.schema, sort, subqueries),
				...getSubqueriesColumns(this.schema, subqueries),
			]),
		).sort() as unknown as ReadonlyArray<Select>

		let result:
			| LinearQueryWithoutSubqueriesImpl<S, Select>
			| LinearQueryWithSubqueriesImpl<S, Select, Q>
			| GroupedQueryImpl<S, GroupBy, LinearQuery<S, Select, {}>>
			| GroupedQueryImpl<S, GroupBy, LinearQuery<S, Select, Q>>
		if (groupBy === undefined) {
			if (subqueries === undefined) {
				result = this.getCachedQuery(
					{
						key: stringify({ filter, resolvedSelect, kind: 'linear' }),
						sort,
						subqueries: null,
					},
					() =>
						new LinearQueryWithoutSubqueriesImpl<S, Select>(
							this.items,
							resolvedSelect,
							filter,
							makeTiebrokenIdSort(sort as Sort<S, {}>),
						),
				)
			} else {
				for (const subqueryKey of Object.keys(subqueries)) {
					if (subqueryKey in this.schema) {
						throw new Error(
							`key '${subqueryKey}' may not be reused for a subquery, since it's already in the schema`,
						)
					}
				}

				result = this.getCachedQuery(
					{
						key: stringify({
							filter,
							resolvedSelect,
							kind: 'linearSubqueries',
						}),
						sort,
						subqueries,
					},
					() =>
						new LinearQueryWithSubqueriesImpl<S, Select, Q>(
							this.items,
							resolvedSelect,
							filter,
							makeTiebrokenIdSort(sort) as (
								a: LinearQueryResultRow<S, keyof S, Q>,
								b: LinearQueryResultRow<S, keyof S, Q>,
							) => number,
							subqueries,
							getSubqueriesDependencies(this.schema, subqueries),
						),
				)
			}
		} else {
			if (subqueries === undefined) {
				result = this.getCachedQuery(
					{
						key: stringify({
							filter,
							resolvedSelect,
							groupBy,
							kind: 'grouped',
						}),
						sort,
						subqueries: null,
					},
					() =>
						new GroupedQueryImpl(this.items, filter, groupBy, (group) =>
							this.query({
								select,
								filter: { ...filter, [groupBy]: group },
								sort: sort as Sort<S, {}>,
							}),
						),
				)
			} else {
				result = this.getCachedQuery(
					{
						key: stringify({
							filter,
							resolvedSelect,
							groupBy,
							kind: 'grouped',
						}),
						sort,
						subqueries,
					},
					() =>
						new GroupedQueryImpl(this.items, filter, groupBy, (group) =>
							this.query({
								select,
								filter: { ...filter, [groupBy]: group },
								subqueries,
								sort,
							}),
						),
				)
			}
		}
		return result
	}

	count(_: { filter?: Filter<S> }): CountQuery
	count<GroupBy extends keyof Primitives<S>>(_: {
		filter?: Filter<S>
		groupBy: GroupBy
	}): GroupedQuery<S, GroupBy, CountQuery>
	count<GroupBy extends keyof Primitives<S>>({
		filter = {},
		groupBy,
	}: {
		filter?: Filter<S>
		groupBy?: GroupBy
	}): CountQuery | GroupedQuery<S, GroupBy, CountQuery> {
		if (debug.on && !debug.makingSubquery) {
			debug.statements.push(
				`const query${++debug.counter} = ${this.debugName}.count(${{
					filter,
					groupBy,
				}})`,
			)
		}

		this.validateColumns([
			...(groupBy !== undefined ? [groupBy] : []),
			...Object.keys(filter),
		])

		let result: CountQueryImpl<S> | GroupedQueryImpl<S, GroupBy, CountQuery>
		if (groupBy === undefined) {
			result = this.getCachedQuery(
				{
					key: stringify({ filter, kind: 'count' }),
					sort: null,
					subqueries: null,
				},
				() => new CountQueryImpl(this.items, filter),
			)
		} else {
			result = this.getCachedQuery(
				{
					key: stringify({ filter, groupBy, kind: 'groupCount' }),
					sort: null,
					subqueries: null,
				},
				() =>
					new GroupedQueryImpl(this.items, filter, groupBy, (group) =>
						this.count({ filter: { ...filter, [groupBy]: group } }),
					),
			)
		}
		this.queryRegistry.register(result)
		return result
	}

	groupBy<
		GroupBy extends keyof Primitives<S>,
		Q extends Query<unknown, MinimalQueryChange, unknown>,
	>({
		groupBy,
		filter,
		subquery,
	}: {
		groupBy: GroupBy
		filter: Filter<S>
		subquery: (group: Row<Primitives<S>>[GroupBy]) => Q
	}): GroupedQuery<S, GroupBy, Q> {
		return this.getCachedQuery(
			{
				key: stringify({ groupBy, filter, kind: 'groupBy' }),
				sort: null,
				subqueries: subquery,
			},
			() => new GroupedQueryImpl(this.items, filter, groupBy, subquery),
		)
	}

	insert(row: Omit<Row<S>, 'id'>): UUID {
		const id = UUID.create()
		this.yTable.set(id, new Y.Map(Object.entries(row)))
		if (debug.on) {
			debug.statements.push(
				`const row${++debug.counter}Id = ${
					this.debugName
				}.insert(${JSON.stringify(row)})`,
			)
			debug.map.set(id, debug.counter)
		}
		return id
	}

	update<K extends Exclude<keyof S, 'id'> & string>(
		id: UUID,
		column: K,
		value: Row<S>[K],
	) {
		if (debug.on) {
			debug.statements.push(
				`${this.debugName}.update(row${debug.map.get(
					id,
				)}Id, '${column}', ${JSON.stringify(value)})`,
			)
		}
		this.yTable.get(id)?.set(column, value)
	}

	delete(id: UUID) {
		if (debug.on) {
			debug.statements.push(
				`${this.debugName}.delete(row${debug.map.get(id)}Id)`,
			)
		}
		this.yTable.delete(id)
	}
}
