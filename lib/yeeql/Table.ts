import { UUID } from '../common/UUID'
import {
	QueryRegistry,
	QueryRegistryEntry,
	addedOrRemoved,
} from './QueryRegistry'
import { LinearQuery, LinearQueryImpl } from './LinearQuery'
import { GroupedQuery, GroupedQueryImpl } from './GroupedQuery'
import { CountQuery, CountQueryImpl } from './CountQuery'
import { GroupedCountQuery, GroupedCountQueryImpl } from './GroupedCountQuery'
import { DefaultMap, ReadonlyDefaultMap } from '../common/DefaultMap'
import { YMap, YEvent } from './YInterfaces'
import { Query, QueryResult, QueryChange } from './Query'
import {
	Row,
	Primitives,
	Filter,
	TableSchema,
	SubqueryGenerators,
	SubqueryResult,
	schemaToDebugString,
} from './Schema'
import stringify from 'json-stable-stringify'
import {
	LinearQueryWithSubqueries,
	LinearQueryWithSubqueriesImpl,
	RowWithSubqueries,
} from './LinearQueryWithSubqueries'
import { compareStrings } from '../common/string'
import { debug } from './debug'

/*
 * We only allow the user to use primitives in their sort function,
 * as objects can change without updating yeeql and cause the sorted order to become invalid
 */
type Sort<S extends TableSchema, Q extends SubqueryGenerators<S>> = (
	a: Row<Primitives<S>> & PrimitiveSubqueriesResults<S, Q>,
	b: Row<Primitives<S>> & PrimitiveSubqueriesResults<S, Q>,
) => number

type PrimitiveQueryResult<QueryResult> =
	// Linear query (with or without subqueries)
	QueryResult extends ReadonlyArray<
		Readonly<RowWithSubqueries<infer S, infer Select, infer Q>>
	>
		? ReadonlyArray<
				Readonly<
					Row<Primitives<Pick<S, Select>>> & PrimitiveSubqueriesResults<S, Q>
				>
		  >
		: // Grouped query
		  QueryResult extends ReadonlyDefaultMap<
					infer GroupValue,
					ReadonlyArray<Readonly<Row<infer Schema>>>
		    >
		  ? ReadonlyDefaultMap<
					GroupValue,
					ReadonlyArray<Readonly<Row<Primitives<Schema>>>>
		    >
		  : // Count query
		    QueryResult extends number
		    ? number
		    : // Group count query
		      QueryResult extends ReadonlyDefaultMap<infer Group, number>
		      ? ReadonlyDefaultMap<Group, number>
		      : // Unknown
		        never

type PrimitiveSubqueriesResults<
	S extends TableSchema,
	Q extends SubqueryGenerators<S>,
> = {
	[K in keyof Q]: PrimitiveQueryResult<SubqueryResult<S, Q[K]>>
}

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

function getSortSubqueriesColumns<
	S extends TableSchema,
	Q extends SubqueryGenerators<S>,
>(schema: S, sort: Sort<S, Q>, subqueries?: Q): Set<keyof S> {
	const result = new Set<keyof S>()
	const proxy = new Proxy({} as Row<S> & PrimitiveSubqueriesResults<S, Q>, {
		get(_, p) {
			if (!(p in schema) && (subqueries === undefined || !(p in subqueries))) {
				throw new Error(
					`unknown column '${p.toString()}' used in 'sort' comparator`,
				)
			}
			if (p in schema) {
				result.add(p as keyof S)
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

	return result
}

const noSort = () => 0

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

	// TODO: Use finalization to keep the cache clean
	private readonly queryCache = new DefaultMap<
		string,
		Map<
			object | null,
			Map<object | undefined | null, WeakRef<Query<unknown, unknown>>>
		>
	>(() => new Map())

	private getCachedQuery<
		Q extends Query<QueryResult<Q>, QueryChange<Q>> & QueryRegistryEntry<S>,
	>(
		key: string,
		sort: object | null,
		subqueries: object | null,
		makeQuery: () => Q,
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
	}): LinearQuery<Row<Pick<S, Select>>>
	query<Select extends keyof S, Q extends SubqueryGenerators<S>>(_: {
		select?: ReadonlyArray<Select>
		filter?: Filter<S>
		subqueries: Q
		sort?: Sort<S, Q>
	}): LinearQueryWithSubqueries<S, keyof S, Q>
	query<Select extends keyof S, GroupBy extends keyof Primitives<S>>(_: {
		select?: ReadonlyArray<Select>
		filter?: Filter<S>
		sort?: Sort<S, {}>
		groupBy: GroupBy
	}): GroupedQuery<Row<Pick<S, Select>>, Row<Primitives<S>>[GroupBy]>
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
		| LinearQuery<Row<Pick<S, Select>>>
		| GroupedQuery<Row<Pick<S, Select>>, Row<Primitives<S>>[GroupBy]>
		| LinearQueryWithSubqueries<S, Select, Q> {
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
				...getSortSubqueriesColumns(this.schema, sort, subqueries),
			]),
		).sort() as unknown as ReadonlyArray<Select>

		let result:
			| LinearQueryImpl<S, Select>
			| GroupedQueryImpl<S, Select, GroupBy>
			| LinearQueryWithSubqueriesImpl<S, Select, Q>
		if (groupBy === undefined) {
			if (subqueries === undefined) {
				result = this.getCachedQuery(
					stringify({ filter, resolvedSelect, kind: 'linear' }),
					sort,
					null,
					() =>
						new LinearQueryImpl<S, Select>(
							this.items,
							resolvedSelect,
							filter,
							this.makeTiebrokenIdSort(sort as Sort<S, {}>),
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
					stringify({ filter, resolvedSelect, kind: 'linearSubqueries' }),
					sort,
					subqueries,
					() =>
						new LinearQueryWithSubqueriesImpl<S, Select, Q>(
							this.items,
							resolvedSelect,
							filter,
							this.makeTiebrokenIdSort(sort) as (
								a: RowWithSubqueries<S, keyof S, Q>,
								b: RowWithSubqueries<S, keyof S, Q>,
							) => number,
							subqueries,
						),
				)
			}
		} else {
			result = this.getCachedQuery(
				stringify({ filter, resolvedSelect, groupBy, kind: 'grouped' }),
				sort,
				null,
				() =>
					new GroupedQueryImpl(
						this.items,
						resolvedSelect,
						filter,
						this.makeTiebrokenIdSort(sort as Sort<S, {}>),
						groupBy,
					),
			)
		}
		return result
	}

	count(_: { filter?: Filter<S> }): CountQuery
	count<GroupBy extends keyof Primitives<S>>(_: {
		filter?: Filter<S>
		groupBy: GroupBy
	}): GroupedCountQuery<Row<S>[GroupBy]>
	count<GroupBy extends keyof Primitives<S>>({
		filter = {},
		groupBy,
	}: {
		filter?: Filter<S>
		groupBy?: GroupBy
	}): CountQuery | GroupedCountQuery<Row<S>[GroupBy]> {
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

		let result: CountQueryImpl<S> | GroupedCountQueryImpl<S, GroupBy>
		if (groupBy === undefined) {
			result = this.getCachedQuery(
				stringify({ filter, kind: 'count' }),
				null,
				null,
				() => new CountQueryImpl(this.items, filter),
			)
		} else {
			result = this.getCachedQuery(
				stringify({ filter, groupBy, kind: 'groupCount' }),
				null,
				null,
				() => new GroupedCountQueryImpl(this.items, filter, groupBy),
			)
		}
		this.queryRegistry.register(result)
		return result
	}

	insert(row: Omit<Row<S>, 'id'>): UUID {
		const id = UUID.create()
		this.yTable.set(
			id,
			new (Object.getPrototypeOf(this.yTable).constructor)(Object.entries(row)),
		)
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

	private makeTiebrokenIdSort<T extends { id: UUID }>(
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
}
