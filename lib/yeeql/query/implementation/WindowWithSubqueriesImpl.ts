/* c8 ignore next */
import {
	InternalChangeCallback,
	QueryBase,
	QueryInternal,
} from 'yeeql/query/QueryBase'
import { Filter, Row, TableSchema } from 'yeeql/table/Schema'
import {
	SubqueriesDependencies,
	SubqueriesResults,
	SubqueryChange,
	SubqueryGenerators,
} from 'yeeql/query/subquery'
import {
	Change,
	LinearQuery,
	ResultRow,
} from 'yeeql/query/interface/LinearQuery'
import { RowSubqueries } from 'yeeql/query/implementation/RowSubqueries'

// Adds subqueries to a window's rows only, when the sort doesn't need them
export class WindowWithSubqueriesImpl<
		S extends TableSchema,
		Select extends keyof S,
		Q extends SubqueryGenerators<S>,
	>
	extends QueryBase<Change<S, Select, Q>>
	implements LinearQuery<S, Select, Q>
{
	constructor(
		window: LinearQuery<S, keyof S, {}> & QueryInternal<Change<S, keyof S, {}>>,
		subqueries: Q,
		dependencies: SubqueriesDependencies<S, Q>,
		filter: Filter<S>,
	) {
		super()
		this.window = window
		const rowSubqueries = new RowSubqueries(
			subqueries,
			dependencies,
			filter,
			(key, augmentedRow, subquery) =>
				this.makeSubqueryCallback(key, augmentedRow, subquery),
			(error) => this.invalidate(error),
		)
		this.rowSubqueries = rowSubqueries
		try {
			this.result = window.result.map((row) => rowSubqueries.add(row as Row<S>))
		} catch (error) {
			// Nobody gets this query, so it must not stay on its subqueries
			rowSubqueries.removeAll()
			throw error
		}

		this.windowCallback = (ready) => {
			const notify = this.notifyingObservers(() => {
				const change = ready()
				const row = change.row as Row<S>
				if (change.kind === 'add') {
					const augmentedRow = rowSubqueries.add(row)
					this.result.splice(change.newIndex, 0, augmentedRow)
					this.rowsReportedThisTransaction.add(augmentedRow)
					return { ...change, row: augmentedRow }
				} else if (change.kind === 'remove') {
					const augmentedRow = rowSubqueries.remove(row)
					this.result.splice(change.oldIndex, 1)
					return { ...change, row: augmentedRow }
				} else {
					const augmentedRow = rowSubqueries.get(row)
					const oldValues = rowSubqueries.update(
						row,
						change.oldValues as Partial<Row<S>>,
					)
					this.result.splice(change.oldIndex, 1)
					this.result.splice(change.newIndex, 0, augmentedRow)
					this.rowsReportedThisTransaction.add(augmentedRow)
					return {
						kind: 'update',
						row: augmentedRow,
						oldIndex: change.oldIndex,
						newIndex: change.newIndex,
						oldValues: oldValues as Partial<ResultRow<S, Select, Q>>,
						type: 'update',
					}
				}
			})
			return () => {
				this.rowsReportedThisTransaction.clear()
				notify()
			}
		}
		window.internalObserve(this.windowCallback, (error) =>
			this.invalidate(error),
		)
	}

	private readonly rowSubqueries: RowSubqueries<S, Q>
	private readonly windowCallback: InternalChangeCallback<
		Change<S, keyof S, {}>
	>

	protected override unobserveDependencies() {
		this.window.internalUnobserve(this.windowCallback)
		this.rowSubqueries.removeAll()
	}

	// Rows already reported with their live subquery results
	private readonly rowsReportedThisTransaction = new Set<
		(typeof this.result)[0]
	>()

	private makeSubqueryCallback<Key extends keyof Q>(
		key: Key,
		augmentedRow: (typeof this.result)[0],
		subquery: QueryInternal<SubqueryChange<S, Q[Key]>>,
	): InternalChangeCallback<SubqueryChange<S, Q[Key]>> {
		return (ready) =>
			this.notifyingObservers(() => {
				const index = this.result.indexOf(augmentedRow)
				const change = ready()
				this.changeReported =
					subquery.changeReported &&
					!this.rowsReportedThisTransaction.has(augmentedRow)
				return {
					kind: 'subquery',
					row: augmentedRow,
					oldIndex: index,
					newIndex: index,
					key,
					change,
					type: 'update',
				}
			})
	}

	// Strong, so the window lives as long as this does
	private readonly window: LinearQuery<S, keyof S, {}> &
		QueryInternal<Change<S, keyof S, {}>>

	readonly result: (Row<S> & SubqueriesResults<S, Q>)[]
	/* c8 ignore next */
}
