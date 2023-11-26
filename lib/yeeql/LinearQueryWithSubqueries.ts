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

type RowWithSubqueries<
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
			this.doItemAdd(row, undefined)
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

	private addedIndex = 0

	doItemAdd(
		row: Row<S>,
		oldValues: Readonly<Partial<Row<S>>> | undefined,
	): void {
		let augmentedRow: (typeof this.result)[0]
		let subQueries: MapValueType<typeof this.rowMap>['subQueries']
		if (oldValues !== undefined) {
			;({ augmentedRow, subQueries } = this.rowMap.get(row)!)
			for (const key of Object.keys(oldValues) as Array<keyof Row<S>>) {
				augmentedRow[key] = row[key] as (typeof augmentedRow)[typeof key]
			}
		} else {
			augmentedRow = { ...row } as (typeof this.result)[0]
			subQueries = {} as typeof subQueries
			this.rowMap.set(row, {
				augmentedRow,
				subQueries,
			})
		}

		updateQuery: for (const [key, makeQuery] of Object.entries(
			this.subQueries,
		) as [keyof Q, Q[keyof Q]][]) {
			const query = makeQuery(row) as Query<
				SubqueryResult<S, Q[keyof Q]>,
				SubqueryChange<S, Q[keyof Q]>
			>
			if (oldValues !== undefined) {
				const { query: oldQuery, callback: oldCallback } = subQueries[key]
				if (query === oldQuery) {
					continue updateQuery
				}
				oldQuery.internalUnobserve(oldCallback)
			}

			augmentedRow[key] = query.result as (typeof augmentedRow)[typeof key]

			let removedIndex: number
			const callback: InternalChangeCallback<SubqueryChange<S, Q[typeof key]>> =
				{
					willChange: () => {
						console.trace()
						removedIndex = removeOrdered(
							this.result,
							augmentedRow as (typeof this.result)[0],
							this.sort,
						)!.index
						console.log('success')
					},
					didChange: (change) => {
						augmentedRow[key] =
							query.result as (typeof augmentedRow)[typeof key]
						const insertedIndex = insertOrdered(
							this.result,
							augmentedRow,
							this.sort,
						)
						return this.notifyObservers({
							kind: 'subquery',
							row: augmentedRow,
							oldIndex: removedIndex,
							newIndex: insertedIndex,
							subChange: { key, change },
							type: 'update',
						})
					},
				}
			query.internalObserve(callback)
			subQueries[key as keyof Q] = {
				query,
				callback,
			}
		}

		this.addedIndex = insertOrdered(this.result, augmentedRow, this.sort)
	}

	postItemAdd(row: Row<S>, type: 'add' | 'update'): () => void {
		return this.notifyObservers({
			kind: 'add',
			row: this.rowMap.get(row)!.augmentedRow,
			newIndex: this.addedIndex,
			type,
		})
	}

	private removedIndex = 0

	doItemRemove(row: Row<S>): void {
		const { augmentedRow } = this.rowMap.get(row)!
		console.trace()
		this.removedIndex = removeOrdered(
			this.result,
			augmentedRow,
			this.sort,
		)!.index
	}

	postItemRemove(row: Row<S>, type: 'delete' | 'update'): () => void {
		const { augmentedRow, subQueries } = this.rowMap.get(row)!

		for (const [, { query, callback }] of Object.entries(subQueries)) {
			query.unobserve(callback)
		}
		this.rowMap.delete(row)

		return this.notifyObservers({
			kind: 'remove',
			row: augmentedRow,
			oldIndex: this.removedIndex,
			type,
		})
	}

	postItemChange(
		row: Row<S>,
		oldValues: Readonly<Partial<Row<S>>>,
	): () => void {
		return this.notifyObservers({
			kind: 'update',
			row: this.rowMap.get(row)!.augmentedRow,
			oldIndex: this.removedIndex,
			newIndex: this.addedIndex,
			oldValues: oldValues as Readonly<
				Partial<RowWithSubqueries<S, Select, Q>>
			>,
			type: 'update',
		})
	}
}
