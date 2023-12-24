import { UUID } from '../common/UUID'
import { insertOrdered, removeOrdered } from '../common/array'
import { LinearQueryChange } from './LinearQuery'
import { InternalChangeCallback, Query } from './Query'
import { QueryBase } from './QueryBase'
import { QueryRegistryEntry } from './QueryRegistry'
import {
	TableSchema,
	Row,
	Filter,
	SubqueryGenerator,
	SubqueryGenerators,
	SubqueriesResults,
	SubqueryResult,
} from './Schema'
import { debug } from './debug'

export type LinearQueryWithSubqueriesChange<Result, SubChange> =
	| LinearQueryChange<Result>
	| {
			kind: 'subquery'
			row: Readonly<Result>
			oldIndex: number
			newIndex: number
			subChange: SubChange
			type: 'update'
	  }

type SubqueryChange<
	S extends TableSchema,
	Q extends SubqueryGenerator<S, unknown, unknown>,
> = Q extends SubqueryGenerator<S, unknown, infer Change> ? Change : never

type SubqueriesChanges<
	S extends TableSchema,
	Q extends SubqueryGenerators<S>,
> = {
	[K in keyof Q]: SubqueryChange<S, Q[K]>
}

type SubqueriesChange<T extends object> = {
	[K in keyof T]: { key: K; change: T[K] }
}[keyof T]

type MapValueType<A> = A extends Map<unknown, infer V> ? V : never

export type LinearQueryWithSubqueries<
	S extends TableSchema,
	Select extends keyof S,
	Q extends SubqueryGenerators<S>,
> = Query<
	ReadonlyArray<Readonly<RowWithSubqueries<S, Select, Q>>>,
	Change<S, Select, Q>
>

type Change<
	S extends TableSchema,
	Select extends keyof S,
	Q extends SubqueryGenerators<S>,
> = LinearQueryWithSubqueriesChange<
	Row<Pick<S, Select>> & SubqueriesResults<S, Q>,
	SubqueriesChange<SubqueriesChanges<S, Q>>
>

export type RowWithSubqueries<
	S extends TableSchema,
	Select extends keyof S,
	Q extends SubqueryGenerators<S>,
> = Row<Pick<S, Select>> & SubqueriesResults<S, Q>

export class LinearQueryWithSubqueriesImpl<
		S extends TableSchema,
		Select extends keyof S,
		Q extends SubqueryGenerators<S>,
	>
	extends QueryBase<Change<S, Select, Q>>
	implements QueryRegistryEntry<S>, LinearQueryWithSubqueries<S, Select, Q>
{
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		select: ReadonlyArray<Select>,
		readonly filter: Filter<S>,
		readonly sort: (
			a: RowWithSubqueries<S, keyof S, Q>,
			b: RowWithSubqueries<S, keyof S, Q>,
		) => number,
		readonly subQueries: SubqueryGenerators<S>,
	) {
		super()
		this.result = []
		addItem: for (const [, row] of items) {
			for (const [key, value] of Object.entries(filter)) {
				if (row[key] !== value) {
					continue addItem
				}
			}
			this.addRow(row, 'add')
		}
		this.select = new Set(select)
	}

	private readonly rowMap = new Map<
		Row<Pick<S, Select>>,
		{
			augmentedRow: Row<S> & SubqueriesResults<S, Q>
			subQueries: {
				[K in keyof Q]: {
					query: Query<SubqueryResult<S, Q[K]>, SubqueryChange<S, Q[K]>>
					callback: InternalChangeCallback<SubqueryChange<S, Q[K]>>
				}
			}
		}
	>()

	readonly select: ReadonlySet<keyof S>

	readonly result: (Row<S> & SubqueriesResults<S, Q>)[]

	addRow(row: Row<S>, type: 'add' | 'update'): () => void {
		const augmentedRow = { ...row } as (typeof this.result)[0]
		const subQueries = {} as MapValueType<typeof this.rowMap>['subQueries']
		this.rowMap.set(row, {
			augmentedRow,
			subQueries,
		})

		for (const [key, makeQuery] of Object.entries(this.subQueries) as [
			keyof Q,
			Q[keyof Q],
		][]) {
			debug.makingSubquery = true
			const query = makeQuery(row) as Query<
				SubqueryResult<S, Q[keyof Q]>,
				SubqueryChange<S, Q[keyof Q]>
			>
			debug.makingSubquery = false

			augmentedRow[key] = query.result as (typeof augmentedRow)[typeof key]

			const callback = this.makeInternalCallback(key, augmentedRow, query)
			query.internalObserve(callback)
			subQueries[key] = { query, callback }
		}

		return this.makeChange(() => {
			const addedIndex = insertOrdered(this.result, augmentedRow, this.sort)
			return {
				kind: 'add',
				row: this.rowMap.get(row)!.augmentedRow,
				newIndex: addedIndex,
				type,
			}
		})
	}

	private makeInternalCallback<Key extends keyof Q>(
		key: Key,
		augmentedRow: (typeof this.result)[0],
		query: Query<SubqueryResult<S, Q[Key]>, SubqueryChange<S, Q[Key]>>,
	): InternalChangeCallback<SubqueryChange<S, Q[Key]>> {
		return (ready) => {
			return this.makeChange(() => {
				const removedIndex = removeOrdered(
					this.result,
					augmentedRow as (typeof this.result)[0],
					this.sort,
				)!.index
				const change = ready()
				augmentedRow[key] = query.result as (typeof augmentedRow)[Key]
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
					subChange: { key, change },
					type: 'update',
				}
			})
		}
	}

	removeRow(row: Row<S>, type: 'delete' | 'update'): () => void {
		return this.makeChange(() => {
			const { augmentedRow, subQueries } = this.rowMap.get(row)!
			for (const [, { query, callback }] of Object.entries(subQueries)) {
				query.unobserve(callback)
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
		oldRow: Row<S>,
		newRow: Row<S>,
		oldValues: Readonly<Partial<Row<S>>>,
	): () => void {
		return this.makeChange(() => {
			const { augmentedRow, subQueries } = this.rowMap.get(oldRow)!
			this.rowMap.delete(oldRow)
			this.rowMap.set(newRow, { augmentedRow, subQueries })

			const removedIndex = removeOrdered(
				this.result,
				augmentedRow,
				this.sort,
			)!.index

			for (const key of Object.keys(oldValues) as Array<keyof Row<S>>) {
				augmentedRow[key] = newRow[key] as (typeof augmentedRow)[typeof key]
			}

			updateQuery: for (const [key, makeQuery] of Object.entries(
				this.subQueries,
			) as [keyof Q, Q[keyof Q]][]) {
				const query = makeQuery(newRow) as Query<
				debug.makingSubquery = true
					SubqueryResult<S, Q[keyof Q]>,
					SubqueryChange<S, Q[keyof Q]>
				>
				debug.makingSubquery = false
				if (oldValues !== undefined) {
					const { query: oldQuery, callback: oldCallback } = subQueries[key]
					if (query === oldQuery) {
						continue updateQuery
					}
					oldQuery.internalUnobserve(oldCallback)
				}

				augmentedRow[key] = query.result as (typeof augmentedRow)[typeof key]

				const callback = this.makeInternalCallback(key, augmentedRow, query)
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
				oldValues: oldValues as Readonly<
					Partial<RowWithSubqueries<S, Select, Q>>
				>,
				type: 'update',
			}
		})
	}
}
