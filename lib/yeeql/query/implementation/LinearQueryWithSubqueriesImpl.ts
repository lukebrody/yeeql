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
			this.result.push(this.augmentRow(row))
		}
		this.result.sort(this.sort)
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

	private augmentRow(row: Row<S>): (typeof this.result)[0] {
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
		return augmentedRow
	}

	addRow(row: Row<S>, type: 'add' | 'update'): () => void {
		const augmentedRow = this.augmentRow(row)
		return this.notifyingObservers(() => {
			const addedIndex = insertOrdered(this.result, augmentedRow, this.sort)
			return {
				kind: 'add',
				row: augmentedRow,
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

	private makeInternalCallback<Key extends keyof Q>(
		key: Key,
		augmentedRow: (typeof this.result)[0],
	): InternalChangeCallback<SubqueryChange<S, Q[Key]>> {
		return (ready) => {
			return this.notifyingObservers(() => {
				const removedIndex = removeOrdered(
					this.result,
					augmentedRow,
					this.sort,
				)!.index
				const change = ready()
				const insertedIndex = insertOrdered(
					this.result,
					augmentedRow,
					this.sort,
				)
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
