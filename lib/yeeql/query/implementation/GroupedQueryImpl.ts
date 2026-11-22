/* c8 ignore next */
import {
	Filter,
	matchesFilter,
	Primitives,
	Row,
	TableSchema,
} from 'yeeql/table/Schema'
import { QueryRegistryEntry } from 'yeeql/table/QueryRegistry'
import { UUID } from 'common/UUID'
import { MapValue, ReadonlyDefaultMap } from 'common/DefaultMap'
import {
	InvalidChange,
	Query,
	QueryChange,
	QueryResult,
} from 'yeeql/query/Query'
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
		private readonly minRows: number,
		readonly makeSubquery: (group: Row<Primitives<S>>[GroupBy]) => Q,
		// Not the subquery's result, which lags behind removeGroup during a transaction
		missingGroupResult: (group: Row<Primitives<S>>[GroupBy]) => unknown,
	) {
		super()
		this.queries = new Map()
		const queries = this.queries
		this.result = {
			get: (group) =>
				(queries.get(group)?.query.result ??
					missingGroupResult(group)) as QueryResult<Q>,
			forEach(callbackfn, thisArg) {
				queries.forEach(({ query }, group) =>
					callbackfn.bind(thisArg)(query.result as QueryResult<Q>, group, this),
				)
			},
			has: (group) => queries.has(group),
			get size() {
				return queries.size
			},
			*entries() {
				for (const [group, { query }] of queries) {
					yield [group, query.result]
				}
			},
			keys: () => queries.keys(),
			*values() {
				for (const { query } of queries.values()) {
					yield query.result
				}
			},
			[Symbol.iterator]: function () {
				return this.entries()
			},
		}
		this.select = new Set([groupBy])

		for (const [, row] of items) {
			if (!matchesFilter(filter, row)) {
				continue
			}
			const group = row[groupBy]
			this.rowCounts.set(group, (this.rowCounts.get(group) ?? 0) + 1)
		}
		try {
			for (const [group, rowCount] of this.rowCounts) {
				if (rowCount >= minRows) {
					this.addQuery(group)
				}
			}
		} catch (error) {
			// Nobody gets this query, so it must not stay on its subqueries
			this.unobserveDependencies()
			throw error
		}
	}

	private readonly rowCounts = new Map<Row<S>[GroupBy], number>()

	readonly select: ReadonlySet<keyof S>

	private readonly queries: Map<
		Row<S>[GroupBy],
		{
			query: Query<QueryResult<Q>, QueryChange<Q>, unknown> &
				QueryInternal<Exclude<QueryChange<Q>, InvalidChange>>
			observer: InternalChangeCallback<Exclude<QueryChange<Q>, InvalidChange>>
		}
	>
	readonly result: ReadonlyDefaultMap<Row<S>[GroupBy], QueryResult<Q>>

	private addQuery(
		group: Row<S>[GroupBy],
	): MapValue<typeof this.queries>['query'] {
		this.unobserveRemovedGroup(group)
		const query = this.makeSubquery(group) as unknown as MapValue<
			typeof this.queries
		>['query']
		const observer: InternalChangeCallback<
			Exclude<QueryChange<Q>, InvalidChange>
		> = (ready) => {
			return this.notifyingObservers(() => {
				const change = ready()
				this.changeReported =
					query.changeReported &&
					this.queries.has(group) &&
					!this.groupsAddedThisTransaction.has(group)
				return {
					kind: 'subquery',
					result: query.result as QueryResult<Q>,
					group,
					change,
					type: change.type,
				}
			})
		}
		query.internalObserve(observer, (error) =>
			// A removed group's subquery no longer affects this query
			this.queries.get(group)?.query === query
				? this.invalidate(error)
				: () => undefined,
		)
		this.queries.set(group, { query, observer })
		return query
	}

	protected override unobserveDependencies() {
		for (const { query, observer } of [
			...this.queries.values(),
			...this.removedGroups.values(),
		]) {
			query.internalUnobserve(observer)
		}
	}

	// Still observed until the transaction ends, because the registry gives this query a removed row before the group's subquery
	private readonly removedGroups = new Map<
		Row<S>[GroupBy],
		MapValue<typeof this.queries>
	>()

	private unobserveRemovedGroup(group: Row<S>[GroupBy]) {
		const removed = this.removedGroups.get(group)
		if (removed !== undefined) {
			removed.query.internalUnobserve(removed.observer)
			this.removedGroups.delete(group)
		}
	}

	addRow(row: Row<S>, type: 'add' | 'update'): () => void {
		const group = row[this.groupBy]
		const rowCount = (this.rowCounts.get(group) ?? 0) + 1
		this.rowCounts.set(group, rowCount)
		if (rowCount !== this.minRows) {
			return () => undefined
		} else {
			let query: MapValue<typeof this.queries>['query']
			let change: {
				kind: 'addGroup'
				group: Row<S>[GroupBy]
				type: 'add' | 'update'
				result: QueryResult<Q>
			}
			const notify = this.notifyingObservers(() => {
				query = this.addQuery(group)
				this.groupsAddedThisTransaction.add(group)
				change = { kind: 'addGroup', group, type, result: query.result }
				return change
			})
			// Notifications run after the transaction, so `result` already has the group's later changes
			return () => {
				this.groupsAddedThisTransaction.delete(group)
				if (this.error === undefined) {
					change.result = query.result
				}
				notify()
			}
		}
	}

	private readonly groupsAddedThisTransaction = new Set<Row<S>[GroupBy]>()

	removeRow(row: Row<S>, type: 'delete' | 'update'): () => void {
		const group = row[this.groupBy]
		const rowCount = this.rowCounts.get(group)! - 1
		if (rowCount === 0) {
			this.rowCounts.delete(group)
		} else {
			this.rowCounts.set(group, rowCount)
		}
		if (rowCount + 1 === this.minRows) {
			const query = this.queries.get(group)!
			const notify = this.notifyingObservers(() => {
				this.queries.delete(group)
				this.removedGroups.set(group, query)
				return {
					kind: 'removeGroup',
					group,
					result: query.query.result,
					type,
				}
			})
			return () => {
				this.unobserveRemovedGroup(group)
				notify()
			}
		} else {
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
			patch(row)
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
	/* c8 ignore next */
}
