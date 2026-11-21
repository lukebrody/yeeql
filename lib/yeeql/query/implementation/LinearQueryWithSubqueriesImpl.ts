/* c8 ignore next */
import { InternalChangeCallback, QueryBase } from 'yeeql/query/QueryBase'
import {
	SubqueriesDependencies,
	SubqueriesResults,
	SubqueryChange,
	SubqueryGenerators,
} from 'yeeql/query/subquery'
import { Filter, matchesFilter, Row, TableSchema } from 'yeeql/table/Schema'
import {
	LinearQuery,
	Change,
	ResultRow,
} from 'yeeql/query/interface/LinearQuery'
import { QueryRegistryEntry } from 'yeeql/table/QueryRegistry'
import { UUID } from 'common/UUID'
import { insertOrdered, removeOrdered } from 'common/array'
import { RowSubqueries } from 'yeeql/query/implementation/RowSubqueries'

export class LinearQueryWithSubqueriesImpl<
		S extends TableSchema,
		Select extends keyof S,
		Q extends SubqueryGenerators<S>,
	>
	extends QueryBase<Change<S, Select, Q>>
	implements QueryRegistryEntry<S>, LinearQuery<S, Select, Q>
{
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		select: ReadonlyArray<Select>,
		readonly filter: Filter<S>,
		readonly sort: (
			a: ResultRow<S, keyof S, Q>,
			b: ResultRow<S, keyof S, Q>,
		) => number,
		subQueries: Q,
		subqueryDependencies: SubqueriesDependencies<S, Q>,
	) {
		super()
		this.result = []
		this.rowSubqueries = new RowSubqueries(
			subQueries,
			subqueryDependencies,
			filter,
			(key, augmentedRow) => this.makeInternalCallback(key, augmentedRow),
		)
		for (const [, row] of items) {
			if (!matchesFilter(filter, row)) {
				continue
			}
			this.addRow(row, 'add')
		}
		this.select = new Set(select)
	}

	private readonly rowSubqueries: RowSubqueries<S, Q>

	readonly select: ReadonlySet<keyof S>

	readonly result: (Row<S> & SubqueriesResults<S, Q>)[]

	addRow(row: Row<S>, type: 'add' | 'update'): () => void {
		const augmentedRow = this.rowSubqueries.add(row)
		return this.notifyingObservers(() => {
			const addedIndex = insertOrdered(this.result, augmentedRow, this.sort)
			return {
				kind: 'add',
				row: augmentedRow,
				newIndex: addedIndex,
				type,
			}
		})
	}

	// Rows on a changing subquery that are still at their old positions
	private readonly staleRows = new Set<(typeof this.result)[0]>()

	private makeInternalCallback<Key extends keyof Q>(
		key: Key,
		augmentedRow: (typeof this.result)[0],
	): InternalChangeCallback<SubqueryChange<S, Q[Key]>> {
		return (ready) => {
			this.staleRows.add(augmentedRow)
			try {
				return this.notifyingObservers(() => {
					const change = ready()
					this.staleRows.delete(augmentedRow)
					const removedIndex = this.result.indexOf(augmentedRow)
					if (removedIndex === -1) {
						throw new Error(
							'subquery changed for a row missing from the result',
						)
					}
					this.result.splice(removedIndex, 1)
					let insertedIndex: number
					if (this.staleRows.size === 0) {
						insertedIndex = insertOrdered(this.result, augmentedRow, this.sort)
					} else {
						// Binary search needs a sorted array, so search only the rows already in place
						const fresh = this.result.filter((row) => !this.staleRows.has(row))
						const freshIndex = insertOrdered(fresh, augmentedRow, this.sort)
						insertedIndex =
							freshIndex === fresh.length - 1
								? this.result.length
								: this.result.indexOf(fresh[freshIndex + 1])
						this.result.splice(insertedIndex, 0, augmentedRow)
					}
					return {
						kind: 'subquery',
						row: augmentedRow,
						oldIndex: removedIndex,
						newIndex: insertedIndex,
						key,
						change,
						type: 'update',
					}
				})
			} finally {
				this.staleRows.delete(augmentedRow)
			}
		}
	}

	removeRow(row: Row<S>, type: 'delete' | 'update'): () => void {
		return this.notifyingObservers(() => {
			const augmentedRow = this.rowSubqueries.remove(row)

			const removedIndex = removeOrdered(
				this.result,
				augmentedRow,
				this.sort,
			)!.index

			return {
				kind: 'remove',
				row: augmentedRow,
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
		return this.notifyingObservers(() => {
			const augmentedRow = this.rowSubqueries.get(row)

			const removedIndex = removeOrdered(
				this.result,
				augmentedRow,
				this.sort,
			)!.index

			patch(row)

			const augmentedOldValues = this.rowSubqueries.update(row, oldValues)

			const addedIndex = insertOrdered(this.result, augmentedRow, this.sort)

			return {
				kind: 'update',
				row: augmentedRow,
				oldIndex: removedIndex,
				newIndex: addedIndex,
				oldValues: augmentedOldValues as Partial<ResultRow<S, Select, Q>>,
				type: 'update',
			}
		})
	}
	/* c8 ignore next */
}
