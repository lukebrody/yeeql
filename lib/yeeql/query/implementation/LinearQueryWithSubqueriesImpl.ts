/* c8 ignore next */
import { debug } from 'common/debug'
import {
	InternalChangeCallback,
	QueryBase,
	QueryInternal,
} from 'yeeql/query/QueryBase'
import {
	SubqueriesDependencies,
	SubqueriesResults,
	SubqueryChange,
	SubqueryGenerators,
	SubqueryResult,
} from 'yeeql/query/subquery'
import {
	Filter,
	guardColumnReads,
	matchesFilter,
	Row,
	TableSchema,
} from 'yeeql/table/Schema'
import {
	LinearQuery,
	Change,
	ResultRow,
} from 'yeeql/query/interface/LinearQuery'
import { QueryRegistryEntry } from 'yeeql/table/QueryRegistry'
import { UUID } from 'common/UUID'
import { Query } from 'yeeql/query/Query'
import { insertOrdered, removeOrdered } from 'common/array'
import { MapValue } from 'common/DefaultMap'

export class LinearQueryWithSubqueriesImpl<
		S extends TableSchema,
		Select extends keyof S,
		Q extends SubqueryGenerators<S>,
	>
	extends QueryBase<Change<S, Select, Q>>
	implements QueryRegistryEntry<S>, LinearQuery<S, Select, Q>
{
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		select: ReadonlyArray<Select>,
		readonly filter: Filter<S>,
		readonly sort: (
			a: ResultRow<S, keyof S, Q>,
			b: ResultRow<S, keyof S, Q>,
		) => number,
		readonly subQueries: Q,
		readonly subqueryDependencies: SubqueriesDependencies<S, Q>,
	) {
		super()
		this.result = []
		for (const [, row] of items) {
			if (!matchesFilter(filter, row)) {
				continue
			}
			this.addRow(row, 'add')
		}
		this.select = new Set(select)
	}

	private readonly rowMap = new Map<
		Row<S>,
		{
			augmentedRow: Row<S> & SubqueriesResults<S, Q>
			subQueries: {
				[K in keyof Q]: {
					query: Query<
						SubqueryResult<S, Q[K]>,
						SubqueryChange<S, Q[K]>,
						unknown
					> &
						QueryInternal<SubqueryChange<S, Q[K]>>
					callback: InternalChangeCallback<SubqueryChange<S, Q[K]>>
				}
			}
		}
	>()

	readonly select: ReadonlySet<keyof S>

	readonly result: (Row<S> & SubqueriesResults<S, Q>)[]

	addRow(row: Row<S>, type: 'add' | 'update'): () => void {
		const subQueries = {} as MapValue<typeof this.rowMap>['subQueries']
		const augmentedRow = new Proxy(row, {
			get(row, p) {
				if (Object.hasOwn(subQueries, p)) {
					return subQueries[p as string].query.result
				}
				return row[p as string]
			},
			ownKeys(row) {
				return Reflect.ownKeys(row).concat(Reflect.ownKeys(subQueries))
			},
			getOwnPropertyDescriptor(row, p) {
				if (Object.hasOwn(subQueries, p)) {
					return {
						configurable: true,
						enumerable: true,
						value: subQueries[p as string].query.result,
					}
				}
				return Reflect.getOwnPropertyDescriptor(row, p)
			},
		}) as (typeof this.result)[0]
		this.rowMap.set(row, {
			augmentedRow,
			subQueries,
		})

		for (const key of Object.keys(this.subQueries) as (keyof Q)[]) {
			const query = this.makeSubquery(key, row)
			const callback = this.makeInternalCallback(key, augmentedRow)
			query.internalObserve(callback)
			subQueries[key] = { query, callback }
		}

		return this.notifyingObservers(() => {
			const addedIndex = insertOrdered(this.result, augmentedRow, this.sort)
			return {
				kind: 'add',
				row: this.rowMap.get(row)!.augmentedRow,
				newIndex: addedIndex,
				type,
			}
		})
	}

	private makeSubquery(key: keyof Q, row: Row<S>) {
		let calling = true
		const guardedRow = guardColumnReads(
			row,
			this.filter,
			(column) => !calling || this.subqueryDependencies.get(column).has(key),
			`subquery '${String(key)}'`,
		)
		debug.makingSubquery = true
		try {
			return this.subQueries[key](guardedRow) as Query<
				SubqueryResult<S, Q[keyof Q]>,
				SubqueryChange<S, Q[keyof Q]>,
				unknown
			> &
				QueryInternal<SubqueryChange<S, Q[keyof Q]>>
		} finally {
			debug.makingSubquery = false
			calling = false
		}
	}

	// Rows on a changing subquery that are still at their old positions
	private readonly staleRows = new Set<(typeof this.result)[0]>()

	private makeInternalCallback<Key extends keyof Q>(
		key: Key,
		augmentedRow: (typeof this.result)[0],
	): InternalChangeCallback<SubqueryChange<S, Q[Key]>> {
		return (ready) => {
			this.staleRows.add(augmentedRow)
			return this.notifyingObservers(() => {
				const change = ready()
				this.staleRows.delete(augmentedRow)
				const removedIndex = this.result.indexOf(augmentedRow)
				this.result.splice(removedIndex, 1)
				let insertedIndex: number
				if (this.staleRows.size === 0) {
					insertedIndex = insertOrdered(this.result, augmentedRow, this.sort)
				} else {
					// Binary search needs a sorted array, so search only the rows already in place
					const fresh = this.result.filter((row) => !this.staleRows.has(row))
					const freshIndex = insertOrdered(fresh, augmentedRow, this.sort)
					insertedIndex =
						freshIndex === fresh.length - 1
							? this.result.length
							: this.result.indexOf(fresh[freshIndex + 1])
					this.result.splice(insertedIndex, 0, augmentedRow)
				}
				return {
					kind: 'subquery',
					row: augmentedRow,
					oldIndex: removedIndex,
					newIndex: insertedIndex,
					key,
					change,
					type: 'update',
				}
			})
		}
	}

	removeRow(row: Row<S>, type: 'delete' | 'update'): () => void {
		return this.notifyingObservers(() => {
			const { augmentedRow, subQueries } = this.rowMap.get(row)!
			for (const [, { query, callback }] of Object.entries(subQueries)) {
				query.internalUnobserve(callback)
			}
			this.rowMap.delete(row)

			const removedIndex = removeOrdered(
				this.result,
				augmentedRow,
				this.sort,
			)!.index

			return {
				kind: 'remove',
				row: augmentedRow,
				oldIndex: removedIndex,
				type,
			}
		})
	}

	changeRow(
		row: Row<S>,
		oldValues: Readonly<Partial<Row<S>>>,
		newValues: Readonly<Partial<Row<S>>>,
		patch: (row: Row<S>) => void,
	): () => void {
		return this.notifyingObservers(() => {
			const { augmentedRow, subQueries } = this.rowMap.get(row)!

			const removedIndex = removeOrdered(
				this.result,
				augmentedRow,
				this.sort,
			)!.index

			patch(row)

			const subqueriesToUpdate = new Set<keyof Q>()
			for (const updatedColumn of Object.keys(newValues)) {
				for (const subqueryKey of this.subqueryDependencies.get(
					updatedColumn,
				)) {
					subqueriesToUpdate.add(subqueryKey)
				}
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TypeScript falls down here
			const augmentedOldValues: any = {
				...oldValues,
			}

			updateQuery: for (const key of subqueriesToUpdate) {
				const query = this.makeSubquery(key, row)
				const { query: oldQuery, callback: oldCallback } = subQueries[key]
				if (query === oldQuery) {
					continue updateQuery
				}
				oldQuery.internalUnobserve(oldCallback)
				augmentedOldValues[key] = oldQuery.result

				const callback = this.makeInternalCallback(key, augmentedRow)
				query.internalObserve(callback)
				subQueries[key] = {
					query,
					callback,
				}
			}

			const addedIndex = insertOrdered(this.result, augmentedRow, this.sort)

			return {
				kind: 'update',
				row: augmentedRow,
				oldIndex: removedIndex,
				newIndex: addedIndex,
				oldValues: augmentedOldValues,
				type: 'update',
			}
		})
	}
	/* c8 ignore next */
}
