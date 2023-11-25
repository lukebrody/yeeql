import { DefaultMap } from '../common/DefaultMap'
import { UUID } from '../common/UUID'
import { insertOrdered, removeOrdered } from '../common/array'
import { LinearQueryChange, LinearQuery, LinearQueryImpl } from './LinearQuery'
import { QueryRegistryEntry } from './QueryRegistry'
import { TableSchema, Row, Filter } from './Schema'

type JoinDescriptor<S extends TableSchema, Select extends keyof S, Result> = {
	dependencies: Set<Select>,
	makeQuery: (row: Row<S>) => LinearQuery<Result>
}

type JoinsDescriptor<S extends TableSchema, Select extends keyof S> = {
	[key: string]: JoinDescriptor<S, Select, unknown>
}

type JoinResult<S extends TableSchema, Select extends keyof S, J extends JoinDescriptor<S, Select, unknown>> = J extends JoinDescriptor<S, Select, infer Result> ? Result : never

type JoinsResult<S extends TableSchema, Select extends keyof S, J extends JoinsDescriptor<S, Select>> = {
	[K in keyof J]: JoinResult<S, Select, J[K]>
}

export class JoinQueryImpl<
	S extends TableSchema, 
	Select extends keyof S, 
	Joins extends JoinsDescriptor<S, Select>
> implements QueryRegistryEntry<S>, LinearQuery<{ row: Row<Pick<S, Select>> } & JoinsResult<S, Select, Joins>> {
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		select: ReadonlyArray<Select>,
		readonly filter: Filter<S>,
		readonly sort: (
			a: { row: Row<S> } & JoinsResult<S, Select, Joins>, 
			b: { row: Row<S> } & JoinsResult<S, Select, Joins>
		) => number,
		joins: JoinsDescriptor<S, Select>
	) {
		this.result = []
		addItem: for (const [, row] of items) {
			for (const [key, value] of Object.entries(filter)) {
				if (row[key] !== value) {
					continue addItem
				}
			}
			const buildingAgumentedRow: {[key: string]: unknown} = { row }
			for (const [key, { makeQuery }] of Object.entries(joins)) {
				const query = makeQuery(row)
				buildingAgumentedRow[key] = query.result
				insertOrdered(this.queryToAugmentedRows.get(query), buildingAgumentedRow as typeof this.result[0], this.sort)
				(query as LinearQueryImpl<TableSchema, string>).privateObservers.add({
					willChange: () => {
						const rows = this.queryToAugmentedRows.get(query)
						for (let i = rows.length - 1; i >= 0; i --) {
							removeOrdered(this.result, rows[i], sort)
							// TODO write down changes for notifications
						}
					},
					didChange: (change: LinearQuery<unknown>) => {
						const rows = this.queryToAugmentedRows.get(query)
						const newRows: typeof rows = []
						for (let i = 0; i < rows.length; i ++) {
							insertOrdered(this.result, rows[i], sort)
							insertOrdered(newRows, rows[i], sort)
							// TODO write down changes for notifications
						}
						this.queryToAugmentedRows.set(query, newRows)
					}
				})
			}
			const augmentedRow = buildingAgumentedRow as typeof this.result[0]
			this.rowToAugmentedRow.set(row, augmentedRow)
			insertOrdered(this.result, augmentedRow, sort)
		}
		this.select = new Set(select)
	}

	// rows should be sorted
	private readonly queryToAugmentedRows = new DefaultMap<LinearQuery<unknown>, typeof this.result>(() => [])

	private readonly rowToAugmentedRow = new Map<Row<Pick<S, Select>>, typeof this.result[0]>()

	readonly select: ReadonlySet<keyof S>

	readonly result: ({ row: Row<S> } & JoinsResult<S, Select, Joins>)[]

	private readonly observers = new Set<(change: LinearQueryChange<Row<Pick<S, Select>>>) => void>()

	observe(observer: (change: LinearQueryChange<Row<Pick<S, Select>>>) => void): void {
		this.observers.add(observer)
	}

	unobserve(observer: (change: LinearQueryChange<Row<Pick<S, Select>>>) => void): void {
		this.observers.delete(observer)
	}

	// The values are baked into the `change` when it is constructed
	private notifyObservers(change: LinearQueryChange<Row<Pick<S, Select>>>): () => void {
		return () => this.observers.forEach(observer => observer(change))
	}

	private addedIndex = 0

	doItemAdd(row: Row<S>): void {
		this.addedIndex = insertOrdered(this.result, row, this.sort)
	}

	postItemAdd(row: Row<S>, type: 'add' | 'update'): () => void {
		return this.notifyObservers({ kind: 'add', row, newIndex: this.addedIndex, type })
	}

	private removedIndex = 0

	doItemRemove(row: Row<S>): void {
		this.removedIndex = removeOrdered(this.result, row, this.sort)!.index
	}

	postItemRemove(row: Row<S>, type: 'delete' | 'update'): () => void {
		return this.notifyObservers({ kind: 'remove', row, oldIndex: this.removedIndex, type })
	}

	postItemChange(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>): () => void {
		return this.notifyObservers({ kind: 'update', row, oldIndex: this.removedIndex, newIndex: this.addedIndex, oldValues, type: 'update' })
	}
}