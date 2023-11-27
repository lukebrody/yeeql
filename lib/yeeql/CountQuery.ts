import { Filter, Row, TableSchema } from './Schema'
import { QueryRegistryEntry } from './QueryRegistry'
import { UUID } from '../common/UUID'
import { Query } from './Query'
import { QueryBase } from './QueryBase'

export type CountQueryChange = 1 | -1

export type CountQuery = Query<number, CountQueryChange>

export class CountQueryImpl<S extends TableSchema>
	extends QueryBase<CountQueryChange>
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

	addRow(): () => void {
		return this.makeChange(() => {
			this.result++
			return 1
		})
	}

	removeRow(): () => void {
		return this.makeChange(() => {
			this.result--
			return -1
		})
	}

	changeRow(): () => void {
		return () => undefined
	}
}
