import { insertOrdered, removeOrdered } from '../common/array'
import { Filter, Primitives, Row, TableSchema } from './Schema'
import { QueryRegistryEntry } from './QueryRegistry'
import { UUID } from '../common/UUID'
import { LinearQueryChange } from './LinearQuery'
import { DefaultMap, ReadonlyDefaultMap } from '../common/DefaultMap'
import { Query } from './Query'

type GroupedQueryChange<Result, GroupValue> = LinearQueryChange<Result> & { group: GroupValue }

export type GroupedQuery<Result, GroupValue> = Query<ReadonlyDefaultMap<GroupValue, ReadonlyArray<Readonly<Result>>>, GroupedQueryChange<Result, GroupValue>>

export class GroupedQueryImpl<
	S extends TableSchema,
	Select extends keyof S,
	GroupBy extends keyof Primitives<S>
> implements QueryRegistryEntry<S>, GroupedQuery<Row<Pick<S, Select>>, Row<Primitives<S>>[GroupBy]> {
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		select: ReadonlyArray<Select>,
		readonly filter: Filter<S>,
		readonly sort: (a: Row<S>, b: Row<S>) => number,
		readonly groupBy: GroupBy
	) {
		this.result = new DefaultMap(() => [])
		addItem: for (const [, row] of items) {
			for (const [key, value] of Object.entries(filter)) {
				if (row[key] !== value) {
					continue addItem
				}
			}
			insertOrdered(this.result.get(row[groupBy]), row, sort)
		}

		this.select = new Set([...select, groupBy])
	}

	readonly select: ReadonlySet<keyof S>

	readonly result: DefaultMap<Row<S>[GroupBy], Row<S>[]>

	private readonly observers = new Set<(change: GroupedQueryChange<Row<Pick<S, Select>>, Row<S>[GroupBy]>) => void>()

	observe(observer: (change: GroupedQueryChange<Row<Pick<S, Select>>, Row<S>[GroupBy]>) => void): void {
		this.observers.add(observer)
	}

	unobserve(observer: (change: GroupedQueryChange<Row<Pick<S, Select>>, Row<S>[GroupBy]>) => void): void {
		this.observers.delete(observer)
	}

	private notifyObservers(change: GroupedQueryChange<Row<Pick<S, Select>>, Row<S>[GroupBy]>): () => void {
		return () => this.observers.forEach(observer => observer(change))
	}

	private added?: { group: Row<S>[GroupBy], newIndex: number }

	doItemAdd(row: Row<S>): void {
		const group = row[this.groupBy]
		this.added = { group, newIndex: insertOrdered(this.result.get(group), row, this.sort) }
	}

	postItemAdd(row: Row<S>, type: 'add' | 'update'): () => void {
		return this.notifyObservers({ kind: 'add', row, ...this.added!, type })
	}

	private removed?: { group: Row<S>[GroupBy], oldIndex: number }

	doItemRemove(row: Row<S>): void {
		const group = row[this.groupBy]
		this.removed = { group, oldIndex: removeOrdered(this.result.get(group), row, this.sort)!.index }
	}

	postItemRemove(row: Row<S>, type: 'delete' | 'update'): () => void {
		return this.notifyObservers({ kind: 'remove', row, ...this.removed!, type })
	}

	postItemChange(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>): () => void {
		if (this.removed!.group === this.added!.group) {
			return this.notifyObservers({ kind: 'update', row, oldIndex: this.removed!.oldIndex, newIndex: this.added!.newIndex, oldValues, group: this.added!.group, type: 'update' })
		} else {
			const removeResult = this.postItemRemove(row, 'update')
			const addResult = this.postItemAdd(row, 'update')
			return () => {
				removeResult()
				addResult()
			}
		}
	}
}