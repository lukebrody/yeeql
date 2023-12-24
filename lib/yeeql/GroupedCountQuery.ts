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

	addRow(row: Row<S>): () => void {
		return this.makeChange(() => {
			const addedGroup = row[this.groupBy]
			this.result.set(addedGroup!, this.result.get(addedGroup) + 1)
			return { group: addedGroup, change: 1 }
		})
	}

	removeRow(row: Row<S>): () => void {
		return this.makeChange(() => {
			const removedGroup = row[this.groupBy]
			this.result.set(removedGroup, this.result.get(removedGroup) - 1)
			return { group: removedGroup, change: -1 }
		})
	}

	changeRow(
		row: Row<S>,
		oldValues: Readonly<Partial<Row<S>>>,
		newValues: Readonly<Partial<Row<S>>>,
		patch: (row: Row<S>) => void,
	): () => void {
		const removedGroup = row[this.groupBy]
		patch(row)
		const addedGroup = row[this.groupBy]
		if (removedGroup !== addedGroup) {
			const removed = this.makeChange(() => {
				this.result.set(removedGroup, this.result.get(removedGroup) - 1)
				return { group: removedGroup, change: -1 }
			})
			const added = this.makeChange(() => {
				this.result.set(addedGroup, this.result.get(addedGroup) + 1)
				return { group: addedGroup, change: 1 }
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
