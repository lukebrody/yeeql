/* c8 ignore next */
import {
	InternalChangeCallback,
	QueryBase,
	QueryInternal,
} from 'yeeql/query/QueryBase'
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
			(key, augmentedRow, subquery) =>
				this.makeInternalCallback(key, augmentedRow, subquery),
			(error) => this.invalidate(error),
		)
		for (const [, row] of items) {
			if (!matchesFilter(filter, row)) {
				continue
			}
			this.result.push(this.rowSubqueries.add(row))
		}
		this.result.sort(this.sort)
		this.select = new Set(select)
	}

	private readonly rowSubqueries: RowSubqueries<S, Q>

	readonly select: ReadonlySet<keyof S>

	readonly result: (Row<S> & SubqueriesResults<S, Q>)[]

	protected override unobserveDependencies() {
		this.rowSubqueries.removeAll()
	}

	addRow(row: Row<S>, type: 'add' | 'update'): () => void {
		const augmentedRow = this.rowSubqueries.add(row)
		const notify = this.notifyingObservers(() => {
			const addedIndex = insertOrdered(this.result, augmentedRow, this.sort)
			this.rowsReportedThisTransaction.add(augmentedRow)
			return {
				kind: 'add',
				row: augmentedRow,
				newIndex: addedIndex,
				type,
			}
		})
		return () => {
			this.rowsReportedThisTransaction.clear()
			notify()
		}
	}

	// Rows already reported with their live subquery results
	private readonly rowsReportedThisTransaction = new Set<
		(typeof this.result)[0]
	>()

	// Rows on a changing subquery that are still at their old positions
	private readonly staleRows = new Set<(typeof this.result)[0]>()

	private makeInternalCallback<Key extends keyof Q>(
		key: Key,
		augmentedRow: (typeof this.result)[0],
		subquery: QueryInternal<SubqueryChange<S, Q[Key]>>,
	): InternalChangeCallback<SubqueryChange<S, Q[Key]>> {
		return (ready) => {
			this.staleRows.add(augmentedRow)
			try {
				const notify = this.notifyingObservers(() => {
					const change = ready()
					this.staleRows.delete(augmentedRow)
					const removedIndex = this.result.indexOf(augmentedRow)
					/* c8 ignore start */
					if (removedIndex === -1) {
						throw new Error(
							'subquery changed for a row missing from the result',
						)
					}
					/* c8 ignore stop */
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
					// A nested sibling's change may have left this false
					this.changeReported = true
					if (
						!subquery.changeReported ||
						this.rowsReportedThisTransaction.has(augmentedRow)
					) {
						if (insertedIndex === removedIndex) {
							this.changeReported = false
						} else {
							// The subquery's change is already in an earlier one, so report only the move
							this.rowsReportedThisTransaction.add(augmentedRow)
							return {
								kind: 'update',
								row: augmentedRow,
								oldIndex: removedIndex,
								newIndex: insertedIndex,
								oldValues: {},
								type: 'update',
							}
						}
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
				return () => {
					this.rowsReportedThisTransaction.clear()
					notify()
				}
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
		const augmentedRow = this.rowSubqueries.get(row)
		const notify = this.notifyingObservers(() => {
			const removedIndex = removeOrdered(
				this.result,
				augmentedRow,
				this.sort,
			)!.index

			patch(row)

			const augmentedOldValues = this.rowSubqueries.update(row, oldValues)

			const addedIndex = insertOrdered(this.result, augmentedRow, this.sort)
			this.rowsReportedThisTransaction.add(augmentedRow)

			return {
				kind: 'update',
				row: augmentedRow,
				oldIndex: removedIndex,
				newIndex: addedIndex,
				oldValues: augmentedOldValues as Partial<ResultRow<S, Select, Q>>,
				type: 'update',
			}
		})
		return () => {
			this.rowsReportedThisTransaction.clear()
			notify()
		}
	}
	/* c8 ignore next */
}
