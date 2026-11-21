/* c8 ignore next */
import {
	InternalChangeCallback,
	QueryBase,
	QueryInternal,
} from 'yeeql/query/QueryBase'
import { TableSchema } from 'yeeql/table/Schema'
import { SubqueryGenerators } from 'yeeql/query/subquery'
import {
	Change,
	LinearQuery,
	ResultRow,
} from 'yeeql/query/interface/LinearQuery'

export class WindowedQueryImpl<
		S extends TableSchema,
		Select extends keyof S,
		Q extends SubqueryGenerators<S>,
	>
	extends QueryBase<Change<S, Select, Q>>
	implements LinearQuery<S, Select, Q>
{
	constructor(
		private readonly query: LinearQuery<S, Select, Q> &
			QueryInternal<Change<S, Select, Q>>,
		private readonly offset: number,
		limit: number,
	) {
		super()
		this.end = offset + limit
		this.result = query.result.slice(offset, this.end)

		// Weak, so that a long-lived query doesn't keep every window over it alive
		const weakThis = new WeakRef(this)
		const callback = (ready: () => Change<S, Select, Q>) => {
			const window = weakThis.deref()
			if (window === undefined) {
				ready()
				query.internalUnobserve(callback)
				return () => undefined
			}
			return window.update(ready())
		}
		query.internalObserve(
			callback,
			(error) => weakThis.deref()?.invalidate(error) ?? (() => undefined),
		)
		this.callback = callback
	}

	private readonly callback: InternalChangeCallback<Change<S, Select, Q>>

	protected override unobserveDependencies() {
		this.query.internalUnobserve(this.callback)
	}

	private readonly end: number

	readonly result: ResultRow<S, Select, Q>[]

	private update(change: Change<S, Select, Q>): () => void {
		const { offset, end } = this
		const indexes =
			change.kind === 'add'
				? [change.newIndex]
				: change.kind === 'remove'
				  ? [change.oldIndex]
				  : [change.oldIndex, change.newIndex]
		if (
			indexes.every((index) => index >= end) ||
			(change.kind !== 'add' &&
				change.kind !== 'remove' &&
				indexes.every((index) => index < offset))
		) {
			return () => undefined
		}

		const next = this.query.result.slice(offset, end)
		const nextRows = new Set(next)
		const prevRows = new Set(this.result)
		const notifications: (() => void)[] = []

		for (const row of prevRows) {
			if (nextRows.has(row)) {
				continue
			}
			notifications.push(
				this.notifyingObservers(() => {
					const oldIndex = this.result.indexOf(row)
					this.result.splice(oldIndex, 1)
					return {
						kind: 'remove',
						row,
						oldIndex,
						type:
							change.kind === 'remove' && row === change.row
								? change.type
								: 'update',
					}
				}),
			)
		}

		if (
			(change.kind === 'update' || change.kind === 'subquery') &&
			prevRows.has(change.row) &&
			nextRows.has(change.row)
		) {
			notifications.push(
				this.notifyingObservers(() => {
					const oldIndex = this.result.indexOf(change.row)
					this.result.splice(oldIndex, 1)
					const newIndex = next
						.slice(0, next.indexOf(change.row))
						.filter((row) => prevRows.has(row)).length
					this.result.splice(newIndex, 0, change.row)
					this.changeReported = this.query.changeReported
					return { ...change, oldIndex, newIndex }
				}),
			)
		}

		next.forEach((row, newIndex) => {
			if (prevRows.has(row)) {
				return
			}
			notifications.push(
				this.notifyingObservers(() => {
					this.result.splice(newIndex, 0, row)
					return {
						kind: 'add',
						row,
						newIndex,
						type:
							change.kind === 'add' && row === change.row
								? change.type
								: 'update',
					}
				}),
			)
		})

		return () => notifications.forEach((notify) => notify())
	}
	/* c8 ignore next */
}
