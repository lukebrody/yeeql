import { UUID } from '../common/UUID'
import { insertOrdered, removeOrdered } from '../common/array'
import { LinearQueryChange } from './LinearQuery'
import { InternalChangeCallback, Query } from './Query'
import { QueryBase } from './QueryBase'
import { QueryRegistryEntry } from './QueryRegistry'
import { TableSchema, Row, Filter } from './Schema'

export type LinearJoinQueryChange<Result, SubChange> =
	LinearQueryChange<Result> | 
	{ 
		kind: 'subquery',
		row: Readonly<Result>,
		oldIndex: number,
		newIndex: number,
		subChange: SubChange, 
		type: 'update'
	} 

type JoinDescriptor<S extends TableSchema, Select extends keyof S, Result, Change> = {
	dependencies: Set<Select>,
	makeQuery: (row: Row<S>) => Query<Result, Change>
}

type JoinsDescriptor<S extends TableSchema, Select extends keyof S> = {
	[key: string]: JoinDescriptor<S, Select, unknown, unknown>
}

type JoinResult<S extends TableSchema, Select extends keyof S, J extends JoinDescriptor<S, Select, unknown, unknown>> = J extends JoinDescriptor<S, Select, infer Result, unknown> ? Result : never
type JoinChange<S extends TableSchema, Select extends keyof S, J extends JoinDescriptor<S, Select, unknown, unknown>> = J extends JoinDescriptor<S, Select, unknown, infer Change> ? Change : never

type JoinsResults<S extends TableSchema, Select extends keyof S, J extends JoinsDescriptor<S, Select>> = {
	[K in keyof J]: JoinResult<S, Select, J[K]>
}

type JoinsChanges<S extends TableSchema, Select extends keyof S, J extends JoinsDescriptor<S, Select>> = {
	[K in keyof J]: JoinChange<S, Select, J[K]>
}

type JoinsChange<T extends object> = 
  { [K in keyof T]: { key: K, change: T[K] } }[keyof T]

// const schema: TableSchema = {
// 	id: new Field<UUID>()
// }

// type J =  { j1: JoinDescriptor<typeof schema, 'id', 'result1', 'change1'>, j2: JoinDescriptor<typeof schema, 'id', 'result2', 'change2'> }
// let jc: JoinsChange<JoinsChanges<typeof schema, 'id', J>>

// jc = { key: 'j1', subChange: 'change1' }
// jc = { key: 'j2', subChange: 'change2' }

// console.log(jc)

// const ch: Change<typeof schema, 'id', J> = { kind: 'subquery', row: { id: UUID.create(), j1: 'result1', j2: 'result2' }, oldIndex: 0, newIndex: 0, key: 'j1', subChange: 'change1', type: 'update' }

// console.log(ch)

type MapValueType<A> = A extends Map<unknown, infer V> ? V : never

export type LinearJoinQuery<Result, SubChange> = Query<ReadonlyArray<Readonly<Result>>, SubChange>

type Change<
	S extends TableSchema, 
	Select extends keyof S, 
	Joins extends JoinsDescriptor<S, Select>
> = LinearJoinQueryChange<Row<Pick<S, Select>> & JoinsResults<S, Select, Joins>, JoinsChange<JoinsChanges<S, Select, Joins>>>

type JoinRow<
S extends TableSchema, 
Select extends keyof S, 
Joins extends JoinsDescriptor<S, Select>
> = Row<Pick<S, Select>> & JoinsResults<S, Select, Joins>

export class LinearJoinQueryImpl<
	S extends TableSchema, 
	Select extends keyof S, 
	Joins extends JoinsDescriptor<S, Select>
> 	
	extends QueryBase<Change<S, Select, Joins>>
	implements QueryRegistryEntry<S>, LinearJoinQuery<JoinRow<S, Select, Joins>, Change<S, Select, Joins>> {
	
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		select: ReadonlyArray<Select>,
		readonly filter: Filter<S>,
		readonly sort: (
			a: JoinRow<S, Select, Joins>, 
			b: JoinRow<S, Select, Joins>
		) => number,
		readonly joins: JoinsDescriptor<S, Select>
	) {
		super()
		this.result = []
		addItem: for (const [, row] of items) {
			for (const [key, value] of Object.entries(filter)) {
				if (row[key] !== value) {
					continue addItem
				}
			}
			
		}
		this.select = new Set(select)
	}

	private readonly rowMap = new Map<Row<Pick<S, Select>>, {
		augmentedRow: (Row<S> & JoinsResults<S, Select, Joins>),
		joinQueries: {
			[K in keyof Joins]: {
				query: (Query<JoinResult<S, Select, Joins[K]>, JoinChange<S, Select, Joins[K]>>)
				callback: (InternalChangeCallback<JoinChange<S, Select, Joins[K]>>)
			}
		}
	}>()

	readonly select: ReadonlySet<keyof S>

	readonly result: (Row<S> & JoinsResults<S, Select, Joins>)[]

	private addedIndex = 0

	doItemAdd(row: Row<S>): void {
		const augmentedRow = { ...row } as typeof this.result[0]
		const joinQueries = {} as MapValueType<typeof this.rowMap>['joinQueries']
		for (const [key, { makeQuery }] of Object.entries(this.joins) as [keyof Joins, Joins[keyof Joins]][]) {
			const query = makeQuery(row) as Query<JoinResult<S, Select, Joins[keyof Joins]>, JoinChange<S, Select, Joins[keyof Joins]>>
			augmentedRow[key] = query.result as typeof augmentedRow[typeof key]

			let removedIndex: number
			const callback: InternalChangeCallback<JoinChange<S, Select, Joins[typeof key]>> = {
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
			joinQueries[key as keyof Joins] = {
				query,
				callback
			}
		}
		this.rowMap.set(row, {
			augmentedRow,
			joinQueries
		})
		this.addedIndex = insertOrdered(this.result, augmentedRow, this.sort)
	}

	postItemAdd(row: Row<S>, type: 'add' | 'update'): () => void {
		return this.notifyObservers({ kind: 'add', row: this.rowMap.get(row)!.augmentedRow, newIndex: this.addedIndex, type })
	}

	private removedIndex = 0

	doItemRemove(row: Row<S>): void {
		const { augmentedRow, joinQueries } = this.rowMap.get(row)!
		this.removedIndex = removeOrdered(this.result, augmentedRow, this.sort)!.index
		for (const [, { query, callback }] of Object.entries(joinQueries)) {
			query.unobserve(callback)
		}
	}

	postItemRemove(row: Row<S>, type: 'delete' | 'update'): () => void {
		const result = this.notifyObservers({ kind: 'remove', row: this.rowMap.get(row)!.augmentedRow, oldIndex: this.removedIndex, type })
		this.rowMap.delete(row)
		return result
	}

	postItemChange(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>): () => void {
		return this.notifyObservers({ 
			kind: 'update', 
			row: this.rowMap.get(row)!.augmentedRow, 
			oldIndex: this.removedIndex, 
			newIndex: this.addedIndex, 
			oldValues: oldValues as Readonly<Partial<JoinRow<S, Select, Joins>>>,
			type: 'update' 
		})
	}
}