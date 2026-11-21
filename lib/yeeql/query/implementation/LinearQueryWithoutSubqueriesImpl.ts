/* c8 ignore next */
import { UUID } from 'common/UUID'
import { findOrdered, insertOrdered } from 'common/array'
import { QueryBase } from 'yeeql/query/QueryBase'
import { QueryRegistryEntry } from 'yeeql/table/QueryRegistry'
import {
	TableSchema,
	Row,
	Filter,
	matchesFilter,
	reportUserError,
} from 'yeeql/table/Schema'
import { LinearQuery, ResultRow } from 'yeeql/query/interface/LinearQuery'
import { QueryChange } from 'yeeql/query/Query'

export class LinearQueryWithoutSubqueriesImpl<
		S extends TableSchema,
		Select extends keyof S,
	>
	extends QueryBase<QueryChange<LinearQuery<S, Select, {}>>>
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
		for (const [, row] of items) {
			if (!matchesFilter(filter, row)) {
				continue
			}
			this.result.push(row)
		}
		this.result.sort(sort)
		this.select = new Set(select)
	}

	readonly select: ReadonlySet<keyof S>

	readonly result: Row<S>[]

	// Rows the sort threw on, which aren't in the result
	private readonly missingRows = new Set<Row<S>>()

	addRow(row: Row<S>, type: 'add' | 'update'): () => void {
		return this.notifyingObservers(() => {
			let addedIndex: number
			try {
				addedIndex = insertOrdered(this.result, row, this.sort)
			} catch (error) {
				this.missingRows.add(row)
				throw error
			}
			return {
				kind: 'add',
				row,
				newIndex: addedIndex,
				type,
			}
		})
	}

	removeRow(row: Row<S>, type: 'delete' | 'update'): () => void {
		if (this.missingRows.delete(row)) {
			return () => undefined
		}
		const removedIndex = findOrdered(this.result, row, this.sort)
		return this.notifyingObservers(() => {
			this.result.splice(removedIndex, 1)
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
		if (this.missingRows.delete(row)) {
			patch(row)
			return this.addRow(row, 'update')
		}
		const removedIndex = findOrdered(this.result, row, this.sort)
		return this.notifyingObservers(() => {
			this.result.splice(removedIndex, 1)
			patch(row)
			let addedIndex: number
			try {
				addedIndex = insertOrdered(this.result, row, this.sort)
			} catch (error) {
				reportUserError(error)
				this.missingRows.add(row)
				return { kind: 'remove', row, oldIndex: removedIndex, type: 'update' }
			}
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
	/* c8 ignore next */
}
