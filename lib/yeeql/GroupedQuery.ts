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
		row: Row<S>,
		oldValues: Readonly<Partial<Row<S>>>,
		newValues: Readonly<Partial<Row<S>>>,
		patch: (row: Row<S>) => void,
	): () => void {
		if (
			!(this.groupBy in oldValues) ||
			oldValues[this.groupBy] === newValues[this.groupBy]
		) {
			const group = row[this.groupBy]
			return this.makeChange(() => {
				const oldIndex = removeOrdered(
					this.result.get(group),
					row,
					this.sort,
				)!.index
				patch(row)
				const newIndex = insertOrdered(this.result.get(group), row, this.sort)
				return {
					kind: 'update',
					row,
					oldIndex: oldIndex,
					newIndex: newIndex,
					oldValues,
					group,
					type: 'update',
				}
			})
		} else {
			const removeResult = this.removeRow(row, 'update')
			patch(row)
			const addResult = this.addRow(row, 'update')
			return () => {
				removeResult()
				addResult()
			}
		}
	}
}
