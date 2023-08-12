import { Filter, Row, Schema } from './Schema'
import { QueryRegistryEntry } from './QueryRegistry'
import { UUID } from '../common/UUID'
import { DefaultMap, ReadonlyDefaultMap } from '../common/DefaultMap'
import { Query } from './Query'

export type GroupedCountQueryChange<Group> = { group: Group, change: 1 | -1 }

export interface GroupedCountQuery<Group> extends Query<ReadonlyDefaultMap<Group, number>, GroupedCountQueryChange<Group>> { }

export class GroupedCountQueryImpl<S extends Schema, GroupBy extends keyof S> implements QueryRegistryEntry<S>, GroupedCountQuery<Row<S>[GroupBy]> {
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		readonly filter: Filter<S>,
		readonly groupBy: GroupBy
	) {
		this.result = new DefaultMap(() => 0)
		addItem: for (const [, row] of items) {
			for (const [key, value] of Object.entries(filter)) {
				if (row[key] !== value) {
					continue addItem
				}
			}
			this.result.set(row[groupBy], this.result.get(row[groupBy]) + 1)
		}
		this.filter = filter
		this.select = new Set([groupBy])
	}

	readonly select: ReadonlySet<keyof S>

	result: DefaultMap<Row<S>[GroupBy], number>

	private readonly observers = new Set<(change: GroupedCountQueryChange<Row<S>[GroupBy]>) => void>()

	observe(observer: (change: GroupedCountQueryChange<Row<S>[GroupBy]>) => void): void {
		this.observers.add(observer)
	}

	unobserve(observer: (change: GroupedCountQueryChange<Row<S>[GroupBy]>) => void): void {
		this.observers.delete(observer)
	}

	private notifyObservers(change: GroupedCountQueryChange<Row<S>[GroupBy]>) {
		this.observers.forEach(observer => observer(change))
	}

	private addedGroup?: Row<S>[GroupBy]

	doItemAdd(row: Row<S>): void {
		this.addedGroup = row[this.groupBy]
		this.result.set(this.addedGroup!, this.result.get(this.addedGroup!) + 1)
	}

	postItemAdd(): void {
		this.notifyObservers({ group: this.addedGroup!, change: 1 })
	}

	private removedGroup?: Row<S>[GroupBy]

	doItemRemove(row: Row<S>): void {
		this.removedGroup = row[this.groupBy]
		this.result.set(this.removedGroup!, this.result.get(this.removedGroup!) - 1)
	}

	postItemRemove(): void {
		this.notifyObservers({ group: this.removedGroup!, change: -1 })
	}

	postItemChange(): void {
		if (this.removedGroup! !== this.addedGroup!) {
			this.notifyObservers({ group: this.removedGroup!, change: -1 })
			this.notifyObservers({ group: this.addedGroup!, change: -1 })
		}
	}
}