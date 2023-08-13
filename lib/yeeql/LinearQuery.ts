import { insertOrdered, removeOrdered } from '../common/array'
import { Filter, Row, TableSchema } from './Schema'
import { QueryRegistryEntry } from './QueryRegistry'
import { UUID } from '../common/UUID'
import { Query } from './Query'

export type LinearQueryChange<Result> =
	{ kind: 'add', row: Readonly<Result>, newIndex: number, type: 'add' | 'update' } |
	{ kind: 'remove', row: Readonly<Result>, oldIndex: number, type: 'delete' | 'update' } |
	{
		kind: 'update',
		row: Readonly<Result>,
		oldIndex: number,
		newIndex: number,
		oldValues: Readonly<Partial<Result>>
		type: 'update'
	}

export type LinearQuery<Result> = Query<ReadonlyArray<Readonly<Result>>, LinearQueryChange<Result>>

export class LinearQueryImpl<S extends TableSchema, Select extends keyof S> implements QueryRegistryEntry<S>, LinearQuery<Row<Pick<S, Select>>> {
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		select: ReadonlyArray<Select>,
		readonly filter: Filter<S>,
		readonly sort: (a: Row<S>, b: Row<S>) => number
	) {
		this.result = []
		addItem: for (const [, row] of items) {
			for (const [key, value] of Object.entries(filter)) {
				if (row[key] !== value) {
					continue addItem
				}
			}
			insertOrdered(this.result, row, sort)
		}
		this.select = new Set(select)
	}

	readonly select: ReadonlySet<keyof S>

	readonly result: Row<S>[]

	private readonly observers = new Set<(change: LinearQueryChange<Row<Pick<S, Select>>>) => void>()

	observe(observer: (change: LinearQueryChange<Row<Pick<S, Select>>>) => void): void {
		this.observers.add(observer)
	}

	unobserve(observer: (change: LinearQueryChange<Row<Pick<S, Select>>>) => void): void {
		this.observers.delete(observer)
	}

	private notifyObservers(change: LinearQueryChange<Row<Pick<S, Select>>>) {
		this.observers.forEach(observer => observer(change))
	}

	private addedIndex = 0

	doItemAdd(row: Row<S>): void {
		this.addedIndex = insertOrdered(this.result, row, this.sort)
	}

	postItemAdd(row: Row<S>, type: 'add' | 'update'): void {
		this.notifyObservers({ kind: 'add', row, newIndex: this.addedIndex, type })
	}

	private removedIndex = 0

	doItemRemove(row: Row<S>): void {
		this.removedIndex = removeOrdered(this.result, row, this.sort)!.index
	}

	postItemRemove(row: Row<S>, type: 'delete' | 'update'): void {
		this.notifyObservers({ kind: 'remove', row, oldIndex: this.removedIndex, type })
	}

	postItemChange(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>): void {
		this.notifyObservers({ kind: 'update', row, oldIndex: this.removedIndex, newIndex: this.addedIndex, oldValues, type: 'update' })
	}
}