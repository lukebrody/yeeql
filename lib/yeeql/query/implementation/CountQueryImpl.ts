import { Filter, Row, TableSchema } from 'yeeql/table/Schema'
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
		addItem: for (const [, row] of items) {
			for (const [key, value] of Object.entries(filter)) {
				if (row[key] !== value) {
					continue addItem
				}
			}
			this.result++
		}
	}

	readonly select: ReadonlySet<keyof S> = new Set()

	result: number

	addRow(row: Row<S>, type: 'add' | 'update'): () => void {
		return this.makeChange(() => {
			this.result++
			return { delta: 1, type }
		})
	}

	removeRow(row: Row<S>, type: 'update' | 'delete'): () => void {
		return this.makeChange(() => {
			this.result--
			return { delta: -1, type }
		})
	}

	changeRow(): () => void {
		return () => undefined
	}
}
