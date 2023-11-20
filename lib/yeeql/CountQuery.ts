import { Filter, Row, TableSchema } from './Schema'
import { QueryRegistryEntry } from './QueryRegistry'
import { UUID } from '../common/UUID'
import { Query } from './Query'

export type CountQueryChange = 1 | -1

export type CountQuery = Query<number, CountQueryChange>

export class CountQueryImpl<S extends TableSchema> implements QueryRegistryEntry<S>, CountQuery {
	constructor(
		items: ReadonlyMap<UUID, Row<S>>,
		readonly filter: Filter<S>,
	) {
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

	private readonly observers = new Set<(change: CountQueryChange) => void>()

	observe(observer: (change: CountQueryChange) => void): void {
		this.observers.add(observer)
	}

	unobserve(observer: (change: CountQueryChange) => void): void {
		this.observers.delete(observer)
	}

	private notifyObservers(change: CountQueryChange): () => void {
		return () => this.observers.forEach(observer => observer(change))
	}

	doItemAdd(): void {
		this.result++
	}

	postItemAdd(): () => void {
		return this.notifyObservers(1)
	}


	doItemRemove(): void {
		this.result--
	}

	postItemRemove(): () => void {
		return this.notifyObservers(-1)
	}

	postItemChange(): () => void {
		// Item changing doesn't add or remove it from the count
		return () => undefined
	}
}