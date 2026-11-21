/* c8 ignore next */
import { debug } from 'common/debug'
import {
	InternalChangeCallback,
	InvalidatedCallback,
	QueryInternal,
} from 'yeeql/query/QueryBase'
import {
	SubqueriesDependencies,
	SubqueriesResults,
	SubqueryChange,
	SubqueryGenerators,
	SubqueryResult,
} from 'yeeql/query/subquery'
import { Filter, guardColumnReads, Row, TableSchema } from 'yeeql/table/Schema'
import { Query } from 'yeeql/query/Query'

type AugmentedRow<
	S extends TableSchema,
	Q extends SubqueryGenerators<S>,
> = Row<S> & SubqueriesResults<S, Q>

type Subquery<
	S extends TableSchema,
	Q extends SubqueryGenerators<S>,
	K extends keyof Q,
> = Query<SubqueryResult<S, Q[K]>, SubqueryChange<S, Q[K]>, unknown> &
	QueryInternal<SubqueryChange<S, Q[K]>>

export class RowSubqueries<
	S extends TableSchema,
	Q extends SubqueryGenerators<S>,
> {
	constructor(
		private readonly generators: Q,
		private readonly dependencies: SubqueriesDependencies<S, Q>,
		private readonly filter: Filter<S>,
		private readonly makeCallback: <K extends keyof Q>(
			key: K,
			augmentedRow: AugmentedRow<S, Q>,
		) => InternalChangeCallback<SubqueryChange<S, Q[K]>>,
		private readonly invalidated: InvalidatedCallback,
	) {}

	private readonly rows = new Map<
		Row<S>,
		{
			augmentedRow: AugmentedRow<S, Q>
			subqueries: {
				[K in keyof Q]: {
					query: Subquery<S, Q, K>
					callback: InternalChangeCallback<SubqueryChange<S, Q[K]>>
				}
			}
		}
	>()

	get(row: Row<S>): AugmentedRow<S, Q> {
		return this.rows.get(row)!.augmentedRow
	}

	add(row: Row<S>): AugmentedRow<S, Q> {
		const subqueries = {} as {
			[K in keyof Q]: {
				query: Subquery<S, Q, K>
				callback: InternalChangeCallback<SubqueryChange<S, Q[K]>>
			}
		}
		const augmentedRow = new Proxy(row, {
			get(row, p) {
				if (Object.hasOwn(subqueries, p)) {
					return subqueries[p as string].query.result
				}
				return row[p as string]
			},
			ownKeys(row) {
				return Reflect.ownKeys(row).concat(Reflect.ownKeys(subqueries))
			},
			getOwnPropertyDescriptor(row, p) {
				if (Object.hasOwn(subqueries, p)) {
					return {
						configurable: true,
						enumerable: true,
						value: subqueries[p as string].query.result,
					}
				}
				return Reflect.getOwnPropertyDescriptor(row, p)
			},
		}) as AugmentedRow<S, Q>
		this.rows.set(row, { augmentedRow, subqueries })

		for (const key of Object.keys(this.generators) as (keyof Q)[]) {
			const query = this.makeSubquery(key, row)
			const callback = this.makeCallback(key, augmentedRow)
			query.internalObserve(callback, this.invalidated)
			subqueries[key] = { query, callback }
		}
		return augmentedRow
	}

	remove(row: Row<S>): AugmentedRow<S, Q> {
		const { augmentedRow, subqueries } = this.rows.get(row)!
		for (const [, { query, callback }] of Object.entries(subqueries)) {
			query.internalUnobserve(callback)
		}
		this.rows.delete(row)
		return augmentedRow
	}

	removeAll() {
		for (const row of this.rows.keys()) {
			this.remove(row)
		}
	}

	/**
	 * Call after `row` has its new values
	 * @returns `oldValues` plus the old results of replaced subqueries
	 */
	update(
		row: Row<S>,
		oldValues: Readonly<Partial<Row<S>>>,
	): Partial<AugmentedRow<S, Q>> {
		const { augmentedRow, subqueries } = this.rows.get(row)!

		const subqueriesToUpdate = new Set<keyof Q>()
		for (const updatedColumn of Object.keys(oldValues)) {
			for (const subqueryKey of this.dependencies.get(updatedColumn)) {
				subqueriesToUpdate.add(subqueryKey)
			}
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TypeScript falls down here
		const augmentedOldValues: any = { ...oldValues }

		for (const key of subqueriesToUpdate) {
			const query = this.makeSubquery(key, row)
			const { query: oldQuery, callback: oldCallback } = subqueries[key]
			if (query === oldQuery) {
				continue
			}
			oldQuery.internalUnobserve(oldCallback)
			augmentedOldValues[key] = oldQuery.result

			const callback = this.makeCallback(key, augmentedRow)
			query.internalObserve(callback, this.invalidated)
			subqueries[key] = { query, callback }
		}

		return augmentedOldValues
	}

	private makeSubquery<K extends keyof Q>(
		key: K,
		row: Row<S>,
	): Subquery<S, Q, K> {
		let calling = true
		const guardedRow = guardColumnReads(
			row,
			this.filter,
			(column) => !calling || this.dependencies.get(column).has(key),
			`subquery '${String(key)}'`,
		)
		debug.makingSubquery = true
		try {
			return this.generators[key](guardedRow) as Subquery<S, Q, K>
		} catch (error) {
			throw new Error(`subquery '${String(key)}' threw`, { cause: error })
		} finally {
			debug.makingSubquery = false
			calling = false
		}
	}
	/* c8 ignore next */
}
