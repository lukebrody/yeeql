import { Filter, Row, TableSchema } from './Schema'
import { QueryRegistryEntry } from './QueryRegistry'
import { UUID } from '../common/UUID'
import { DefaultMap, ReadonlyDefaultMap } from '../common/DefaultMap'
import { Query } from './Query'
import { QueryBase } from './QueryBase'

export type GroupedCountQueryChange<Group> = { group: Group; change: 1 | -1 }

export type GroupedCountQuery<Group> = Query<
	ReadonlyDefaultMap<Group, number>,
	GroupedCountQueryChange<Group>
>

export class GroupedCountQueryImpl<
		S extends TableSchema,
		GroupBy extends keyof S,
	>
	extends QueryBase<GroupedCountQueryChange<Row<S>[GroupBy]>>
	implements QueryRegistryEntry<S>, GroupedCountQuery<Row<S>[GroupBy]>
{
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		readonly filter: Filter<S>,
		readonly groupBy: GroupBy,
	) {
		super()
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

	private addedGroup?: Row<S>[GroupBy]

	doItemAdd(row: Row<S>): void {
		this.addedGroup = row[this.groupBy]
		this.result.set(this.addedGroup!, this.result.get(this.addedGroup!) + 1)
	}

	postItemAdd(): () => void {
		return this.notifyObservers({ group: this.addedGroup!, change: 1 })
	}

	private removedGroup?: Row<S>[GroupBy]

	doItemRemove(row: Row<S>): void {
		this.removedGroup = row[this.groupBy]
		this.result.set(this.removedGroup!, this.result.get(this.removedGroup!) - 1)
	}

	postItemRemove(): () => void {
		return this.notifyObservers({ group: this.removedGroup!, change: -1 })
	}

	postItemChange(): () => void {
		if (this.removedGroup! !== this.addedGroup!) {
			const removed = this.notifyObservers({
				group: this.removedGroup!,
				change: -1,
			})
			const added = this.notifyObservers({
				group: this.addedGroup!,
				change: -1,
			})
			return () => {
				removed()
				added()
			}
		} else {
			return () => undefined
		}
	}
}
