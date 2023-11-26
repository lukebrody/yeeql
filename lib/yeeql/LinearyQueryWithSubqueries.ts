import { UUID } from '../common/UUID'
import { insertOrdered, removeOrdered } from '../common/array'
import { LinearQueryChange } from './LinearQuery'
import { InternalChangeCallback, Query } from './Query'
import { QueryBase } from './QueryBase'
import { QueryRegistryEntry } from './QueryRegistry'
import { TableSchema, Row, Filter } from './Schema'

export type LinearQueryWithSubqueriesChange<Result, SubChange> =
	LinearQueryChange<Result> | 
	{ 
		kind: 'subquery',
		row: Readonly<Result>,
		oldIndex: number,
		newIndex: number,
		subChange: SubChange, 
		type: 'update'
	} 

type SubqueryGenerator<S extends TableSchema, Select extends keyof S, Result, Change> = (row: Row<Pick<S, Select>>) => Query<Result, Change>

type SubqueryGenerators<S extends TableSchema, Select extends keyof S> = {
	[key: string]: SubqueryGenerator<S, Select, unknown, unknown>
}

type SubqueryResult<S extends TableSchema, Select extends keyof S, J extends SubqueryGenerator<S, Select, unknown, unknown>> = J extends SubqueryGenerator<S, Select, infer Result, unknown> ? Result : never
type SubqueryChange<S extends TableSchema, Select extends keyof S, J extends SubqueryGenerator<S, Select, unknown, unknown>> = J extends SubqueryGenerator<S, Select, unknown, infer Change> ? Change : never

type SubqueriesResults<S extends TableSchema, Select extends keyof S, J extends SubqueryGenerators<S, Select>> = {
	[K in keyof J]: SubqueryResult<S, Select, J[K]>
}

type SubqueriesChanges<S extends TableSchema, Select extends keyof S, J extends SubqueryGenerators<S, Select>> = {
	[K in keyof J]: SubqueryChange<S, Select, J[K]>
}

type SubqueriesChange<T extends object> = 
  { [K in keyof T]: { key: K, change: T[K] } }[keyof T]

type MapValueType<A> = A extends Map<unknown, infer V> ? V : never

export type LinearyQueryWithSubqueries<Result, SubChange> = Query<ReadonlyArray<Readonly<Result>>, SubChange>

type Change<
	S extends TableSchema, 
	Select extends keyof S, 
	Joins extends SubqueryGenerators<S, Select>
> = LinearQueryWithSubqueriesChange<Row<Pick<S, Select>> & SubqueriesResults<S, Select, Joins>, SubqueriesChange<SubqueriesChanges<S, Select, Joins>>>

type RowWithSubqueries<
	S extends TableSchema, 
	Select extends keyof S, 
	Joins extends SubqueryGenerators<S, Select>
> = Row<Pick<S, Select>> & SubqueriesResults<S, Select, Joins>

export class LinearyQueryWithSubqueriesImpl<
	S extends TableSchema, 
	Select extends keyof S, 
	Joins extends SubqueryGenerators<S, Select>
> 	
	extends QueryBase<Change<S, Select, Joins>>
	implements QueryRegistryEntry<S>, LinearyQueryWithSubqueries<RowWithSubqueries<S, Select, Joins>, Change<S, Select, Joins>> {
	
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		select: ReadonlyArray<Select>,
		readonly filter: Filter<S>,
		readonly sort: (
			a: RowWithSubqueries<S, Select, Joins>, 
			b: RowWithSubqueries<S, Select, Joins>
		) => number,
		readonly subQueries: SubqueryGenerators<S, Select>
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

	private readonly rowMap = new Map<Row<Pick<S, Select>>, {
		augmentedRow: (Row<S> & SubqueriesResults<S, Select, Joins>),
		subQueries: {
			[K in keyof Joins]: {
				query: (Query<SubqueryResult<S, Select, Joins[K]>, SubqueryChange<S, Select, Joins[K]>>)
				callback: (InternalChangeCallback<SubqueryChange<S, Select, Joins[K]>>)
			}
		}
	}>()

	readonly select: ReadonlySet<keyof S>

	readonly result: (Row<S> & SubqueriesResults<S, Select, Joins>)[]

	private addedIndex = 0

	doItemAdd(row: Row<S>,  oldValues: Readonly<Partial<Row<S>>> | undefined): void {
		let augmentedRow: typeof this.result[0]
		let subQueries: MapValueType<typeof this.rowMap>['subQueries']
		if (oldValues !== undefined) {
			({ augmentedRow, subQueries } = this.rowMap.get(row)!)
			for (const key of Object.keys(oldValues) as Array<keyof Row<S>>) {
				augmentedRow[key] = row[key] as typeof augmentedRow[typeof key]
			}
		}
		else {
			augmentedRow = { ...row } as typeof this.result[0]
			subQueries = {} as typeof subQueries
			this.rowMap.set(row, {
				augmentedRow,
				subQueries
			})
		}

		updateQuery: for (const [key, makeQuery] of Object.entries(this.subQueries) as [keyof Joins, Joins[keyof Joins]][]) {
			const query = makeQuery(row) as Query<SubqueryResult<S, Select, Joins[keyof Joins]>, SubqueryChange<S, Select, Joins[keyof Joins]>>
			if (oldValues !== undefined) {
				const { query: oldQuery, callback: oldCallback } = subQueries[key]
				if (query === oldQuery) {
					continue updateQuery
				}
				oldQuery.internalUnobserve(oldCallback)
			}

			augmentedRow[key] = query.result as typeof augmentedRow[typeof key]

			let removedIndex: number
			const callback: InternalChangeCallback<SubqueryChange<S, Select, Joins[typeof key]>> = {
				willChange: () => {
					removedIndex = removeOrdered(this.result, augmentedRow as typeof this.result[0], this.sort)!.index
				},
				didChange: (change) => {
					augmentedRow[key] = query.result as typeof augmentedRow[typeof key]
					const insertedIndex = insertOrdered(this.result, augmentedRow, this.sort)
					return this.notifyObservers({ 
						kind: 'subquery', 
						row: augmentedRow, 
						oldIndex: removedIndex,
						newIndex: insertedIndex,
						subChange: { key, change },
						type: 'update'
					})
				}
			}
			query.internalObserve(callback)
			subQueries[key as keyof Joins] = {
				query,
				callback
			}
		}
		
		this.addedIndex = insertOrdered(this.result, augmentedRow, this.sort)
	}

	postItemAdd(row: Row<S>, type: 'add' | 'update'): () => void {
		return this.notifyObservers({ kind: 'add', row: this.rowMap.get(row)!.augmentedRow, newIndex: this.addedIndex, type })
	}

	private removedIndex = 0

	doItemRemove(row: Row<S>): void {
		const { augmentedRow } = this.rowMap.get(row)!
		this.removedIndex = removeOrdered(this.result, augmentedRow, this.sort)!.index
	}

	postItemRemove(row: Row<S>, type: 'delete' | 'update'): () => void {
		const { augmentedRow, subQueries } = this.rowMap.get(row)!
		
		for (const [, { query, callback }] of Object.entries(subQueries)) {
			query.unobserve(callback)
		}
		this.rowMap.delete(row)

		return this.notifyObservers({ kind: 'remove', row: augmentedRow, oldIndex: this.removedIndex, type })
	}

	postItemChange(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>): () => void {
		return this.notifyObservers({ 
			kind: 'update', 
			row: this.rowMap.get(row)!.augmentedRow, 
			oldIndex: this.removedIndex, 
			newIndex: this.addedIndex, 
			oldValues: oldValues as Readonly<Partial<RowWithSubqueries<S, Select, Joins>>>,
			type: 'update' 
		})
	}
}