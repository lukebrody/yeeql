import { UUID } from '../../common/UUID'
import { insertOrdered, removeOrdered } from '../../common/array'
import { Query } from '../Query'
import { QueryBase, InternalChangeCallback, QueryInternal } from '../QueryBase'
import { QueryRegistryEntry } from '../QueryRegistry'
import {
	TableSchema,
	Row,
	Filter,
	SubqueryGenerators,
	SubqueriesResults,
	SubqueryResult,
	SubqueriesDependencies,
	SubqueryChange,
} from 'yeeql/Schema'
import { LinearQueryChange, LinearQuery } from './types'

export class LinearQueryImpl<S extends TableSchema, Select extends keyof S>
	extends QueryBase<LinearQueryChange<S, Select, {}>>
	implements QueryRegistryEntry<S>, LinearQuery<S, Select, {}>
{
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		select: ReadonlyArray<Select>,
		readonly filter: Filter<S>,
		readonly sort: (a: Row<S>, b: Row<S>) => number,
	) {
		super()
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

	addRow(row: Row<S>, type: 'add' | 'update'): () => void {
		return this.makeChange(() => {
			const addedIndex = insertOrdered(this.result, row, this.sort)
			return {
				kind: 'add',
				row,
				newIndex: addedIndex,
				type,
			}
		})
	}

	removeRow(row: Row<S>, type: 'delete' | 'update'): () => void {
		return this.makeChange(() => {
			const removedIndex = removeOrdered(this.result, row, this.sort)!.index
			return {
				kind: 'remove',
				row,
				oldIndex: removedIndex,
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
		return this.makeChange(() => {
			const removedIndex = removeOrdered(this.result, row, this.sort)!.index
			patch(row)
			const addedIndex = insertOrdered(this.result, row, this.sort)
			return {
				kind: 'update',
				row: row,
				oldIndex: removedIndex,
				newIndex: addedIndex,
				oldValues: oldValues as Partial<ResultRow<S, Select, {}>>,
				type: 'update',
			}
		})
	}
}
