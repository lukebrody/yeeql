import { insertOrdered, removeOrdered } from 'common/array'
import { Filter, Primitives, Row, TableSchema } from 'yeeql/table/Schema'
import { QueryRegistryEntry } from 'yeeql/table/QueryRegistry'
import { UUID } from 'common/UUID'
import { DefaultMap } from 'common/DefaultMap'
import { QueryChange } from 'yeeql/query/Query'
import { QueryBase } from 'yeeql/query/QueryBase'
import { GroupedQuery } from 'yeeql/query/interface/GroupedQuery'
import { ResultRow } from 'yeeql/query/interface/LinearQuery'

export class GroupedQueryWithoutSubqueriesImpl<
		S extends TableSchema,
		Select extends keyof S,
		GroupBy extends keyof Primitives<S>,
	>
	extends QueryBase<QueryChange<GroupedQuery<S, Select, GroupBy, {}>>>
	implements QueryRegistryEntry<S>, GroupedQuery<S, Select, GroupBy, {}>
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
			if (this.result.get(group).length === 0) {
				this.result.delete(group)
			}
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
					oldValues: oldValues as Partial<ResultRow<S, Select, {}>>,
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
