/* c8 ignore next */
import { Filter, matchesFilter, Row, TableSchema } from 'yeeql/table/Schema'
import { QueryRegistryEntry } from 'yeeql/table/QueryRegistry'
import { UUID } from 'common/UUID'
import { QueryBase } from 'yeeql/query/QueryBase'
import { CountQuery } from 'yeeql/query/interface/CountQuery'
import { QueryChange } from 'yeeql/query/Query'

export class CountQueryImpl<S extends TableSchema>
	extends QueryBase<QueryChange<CountQuery>>
	implements QueryRegistryEntry<S>, CountQuery
{
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		readonly filter: Filter<S>,
	) {
		super()
		this.result = 0
		for (const [, row] of items) {
			if (!matchesFilter(filter, row)) {
				continue
			}
			this.result++
		}
	}

	readonly select: ReadonlySet<keyof S> = new Set()

	result: number

	addRow(row: Row<S>, type: 'add' | 'update'): () => void {
		return this.notifyingObservers(() => {
			this.result++
			return { delta: 1, type }
		})
	}

	removeRow(row: Row<S>, type: 'update' | 'delete'): () => void {
		return this.notifyingObservers(() => {
			this.result--
			return { delta: -1, type }
		})
	}

	changeRow(
		row: Row<S>,
		oldValues: Readonly<Partial<Row<S>>>,
		newValues: Readonly<Partial<Row<S>>>,
		patch: (row: Row<S>) => void,
	): () => void {
		patch(row)
		return () => undefined
	}
	/* c8 ignore next */
}
