import { insertOrdered, removeOrdered } from '../common/array'
import { Filter, Primitives, Row, TableSchema } from './Schema'
import { QueryRegistryEntry } from './QueryRegistry'
import { UUID } from '../common/UUID'
import { LinearQueryChange } from './LinearQuery'
import { DefaultMap, ReadonlyDefaultMap } from '../common/DefaultMap'
import { Query } from './Query'
import { QueryBase } from './QueryBase'

type GroupedQueryChange<Result, GroupValue> = LinearQueryChange<Result> & {
	group: GroupValue
}

export type GroupedQuery<Result, GroupValue> = Query<
	ReadonlyDefaultMap<GroupValue, ReadonlyArray<Readonly<Result>>>,
	GroupedQueryChange<Result, GroupValue>
>

export class GroupedQueryImpl<
		S extends TableSchema,
		Select extends keyof S,
		GroupBy extends keyof Primitives<S>,
	>
	extends QueryBase<
		GroupedQueryChange<Row<Pick<S, Select>>, Row<Primitives<S>>[GroupBy]>
	>
	implements
		QueryRegistryEntry<S>,
		GroupedQuery<Row<Pick<S, Select>>, Row<Primitives<S>>[GroupBy]>
{
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		select: ReadonlyArray<Select>,
		readonly filter: Filter<S>,
		readonly sort: (a: Row<S>, b: Row<S>) => number,
		readonly groupBy: GroupBy,
	) {
		super()
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

	addRow(row: Row<S>, type: 'add' | 'update'): () => void {
		return this.makeChange(() => {
			const group = row[this.groupBy]
			const newIndex = insertOrdered(this.result.get(group), row, this.sort)
			return { kind: 'add', row, group, newIndex, type }
		})
	}

	removeRow(row: Row<S>, type: 'delete' | 'update'): () => void {
		return this.makeChange(() => {
			const group = row[this.groupBy]
			const oldIndex = removeOrdered(
				this.result.get(group),
				row,
				this.sort,
			)!.index
			return {
				kind: 'remove',
				row,
				group,
				oldIndex,
				type,
			}
		})
	}

	changeRow(
		oldRow: Row<S>,
		newRow: Row<S>,
		oldValues: Readonly<Partial<Row<S>>>,
	): () => void {
		const removedGroup = oldRow[this.groupBy]
		const addedGroup = newRow[this.groupBy]
		if (removedGroup === addedGroup) {
			return this.makeChange(() => {
				const oldIndex = removeOrdered(
					this.result.get(removedGroup),
					oldRow,
					this.sort,
				)!.index
				const newIndex = insertOrdered(
					this.result.get(addedGroup),
					newRow,
					this.sort,
				)
				return {
					kind: 'update',
					row: newRow,
					oldIndex: oldIndex,
					newIndex: newIndex,
					oldValues,
					group: addedGroup,
					type: 'update',
				}
			})
		} else {
			const removeResult = this.removeRow(oldRow, 'update')
			const addResult = this.addRow(newRow, 'update')
			return () => {
				removeResult()
				addResult()
			}
		}
	}
}
