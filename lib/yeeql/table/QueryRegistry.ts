/* c8 ignore next */
import { DefaultMap } from 'common/DefaultMap'
import {
	Comparable,
	Filter,
	Row,
	TableSchema,
	isRange,
	rangeType,
	stringifyKey,
} from 'yeeql/table/Schema'
import { RangeIndex } from 'yeeql/table/RangeIndex'

const notSpecified = Symbol()
type NotSpecified = typeof notSpecified

export const addedOrRemoved = Symbol()
type AddedOrRemoved = typeof addedOrRemoved

class QueryTreeNode<S extends TableSchema> {
	constructor(makeChild: () => QueryTree<S>) {
		this.values = new DefaultMap(makeChild)
		this.ranges = new DefaultMap(makeChild)
	}

	readonly values: DefaultMap<unknown | NotSpecified, QueryTree<S>>
	// Keyed by stringified range
	readonly ranges: DefaultMap<string, QueryTree<S>>
	// Keyed by `rangeType`
	readonly rangeIndexes = new DefaultMap<string, RangeIndex<QueryTree<S>>>(
		() => new RangeIndex(),
	)

	get size(): number {
		return this.values.size + this.ranges.size
	}
}
type QueryTreeLeaf<S extends TableSchema> = DefaultMap<
	keyof S | AddedOrRemoved,
	Array<WeakRef<QueryRegistryEntry<S>>>
>
type QueryTree<S extends TableSchema> = QueryTreeNode<S> | QueryTreeLeaf<S>

function buildQueryTree<S extends TableSchema>(
	fields: ReadonlyArray<keyof S>,
): QueryTree<S> {
	if (fields.length == 0) {
		const result: QueryTreeLeaf<S> = new DefaultMap(() => [])
		return result
	} else {
		return new QueryTreeNode(() => buildQueryTree(fields.slice(1)))
	}
}

function insertIntoQueryTree<S extends TableSchema>(
	qt: QueryTree<S>,
	fields: ReadonlyArray<keyof S>,
	query: QueryRegistryEntry<S>,
): void {
	if (fields.length == 0) {
		const leaf = qt as QueryTreeLeaf<S>
		const weakRef = new WeakRef(query)
		leaf.get(addedOrRemoved).push(weakRef)
		for (const observeKey of query.select) {
			leaf.get(observeKey).push(weakRef)
		}
		for (const filterKey of Object.keys(query.filter)) {
			if (!query.select.has(filterKey)) {
				leaf.get(filterKey).push(weakRef)
			}
		}
	} else {
		const node = qt as QueryTreeNode<S>
		const key =
			fields[0] in query.filter
				? query.filter[fields[0] as keyof typeof query.filter]
				: notSpecified
		let child: QueryTree<S>
		if (isRange(key)) {
			const rangeKey = stringifyKey(key)
			if (!node.ranges.has(rangeKey)) {
				node.rangeIndexes
					.get(rangeType(key))
					.add(key, node.ranges.get(rangeKey))
			}
			child = node.ranges.get(rangeKey)
		} else {
			child = node.values.get(key)
		}
		insertIntoQueryTree(child, fields.slice(1), query)
	}
}

function deleteFromQueryTree<S extends TableSchema>(
	qt: QueryTree<S>,
	fields: ReadonlyArray<keyof S>,
	filter: Filter<S>,
): void {
	if (fields.length == 0) {
		const leaf = qt as QueryTreeLeaf<S>
		for (const [key, arr] of leaf) {
			for (let i = 0; i < arr.length; ) {
				if (arr[i].deref() === undefined) {
					arr.splice(i, 1)
				} else {
					i++
				}
			}
			if (arr.length === 0) {
				leaf.delete(key)
			}
		}
	} else {
		const node = qt as QueryTreeNode<S>
		const key =
			fields[0] in filter
				? filter[fields[0] as keyof typeof filter]
				: notSpecified
		if (isRange(key)) {
			const rangeKey = stringifyKey(key)
			// Already removed when finalizing another query with the same filter
			if (!node.ranges.has(rangeKey)) {
				return
			}
			const child = node.ranges.get(rangeKey)
			deleteFromQueryTree(child, fields.slice(1), filter)
			if (child.size == 0) {
				node.ranges.delete(rangeKey)
				const rangeIndex = node.rangeIndexes.get(rangeType(key))
				rangeIndex.delete(key, child)
				if (rangeIndex.isEmpty) {
					node.rangeIndexes.delete(rangeType(key))
				}
			}
		} else {
			const child = node.values.get(key)
			deleteFromQueryTree(child, fields.slice(1), filter)
			if (child.size == 0) {
				node.values.delete(key)
			}
		}
	}
}

export const _testQueryEntries = { value: 0 }

function collectFromQueryTree<S extends TableSchema>(
	qt: QueryTree<S>,
	fields: ReadonlyArray<keyof S>,
	row: Row<S>,
	changed: AddedOrRemoved | Partial<Row<S>>,
	result: Set<QueryRegistryEntry<S>>,
): void {
	if (fields.length === 0) {
		const leaf = qt as QueryTreeLeaf<S>
		for (const key of changed === addedOrRemoved
			? ([addedOrRemoved] as Array<AddedOrRemoved>)
			: Object.keys(changed)) {
			for (const weakQuery of leaf.get(key)) {
				const query = weakQuery.deref()
				_testQueryEntries.value++
				if (query) {
					result.add(query)
				}
			}
		}
	} else {
		const node = qt as QueryTreeNode<S>
		const value = row[fields[0]]
		collectFromQueryTree(
			node.values.get(notSpecified),
			fields.slice(1),
			row,
			changed,
			result,
		)
		if (node.values.has(value)) {
			collectFromQueryTree(
				node.values.get(value),
				fields.slice(1),
				row,
				changed,
				result,
			)
		}
		if (node.rangeIndexes.has(typeof value)) {
			for (const child of node.rangeIndexes
				.get(typeof value)
				.get(value as Comparable)) {
				collectFromQueryTree(child, fields.slice(1), row, changed, result)
			}
		}
	}
}

export class QueryRegistry<S extends TableSchema> {
	private readonly finalizer = new FinalizationRegistry<Filter<S>>((filter) =>
		deleteFromQueryTree(this.qt, this.fields, filter),
	)

	constructor(schema: S) {
		this.fields = Object.keys(schema).sort()
		this.qt = buildQueryTree(this.fields)
	}

	private readonly fields: ReadonlyArray<keyof S>
	private readonly qt: QueryTree<S>

	register(query: QueryRegistryEntry<S>): void {
		insertIntoQueryTree(this.qt, this.fields, query)
		this.finalizer.register(query, query.filter)
	}

	queries(
		row: Row<S>,
		changes: Partial<Row<S>> | AddedOrRemoved,
	): Set<QueryRegistryEntry<S>> {
		const result = new Set<QueryRegistryEntry<S>>()
		collectFromQueryTree(this.qt, this.fields, row, changes, result)
		return result
	}
	/* c8 ignore next */
}

export interface QueryRegistryEntry<S extends TableSchema> {
	readonly filter: Readonly<Filter<S>> // Values that old or new need to match
	readonly select: ReadonlySet<keyof S> // Other fields that we care about changing

	// The below methods are driven from Table.ts

	/**
	 * `type` is 'add' when this row is freshly added to the table, update when the row comes in scope of the filter
	 * @returns a function that sends notifications to observers
	 */
	addRow(row: Row<S>, type: 'add' | 'update'): () => void

	/**
	 * @returns a function that sends notifications to observers
	 */
	removeRow(row: Row<S>, type: 'delete' | 'update'): () => void

	/**
	 * @param row is the table row, with the old values
	 * @param oldValues is an object with the keys that will update, and the values they will update from
	 * @param newValues is an object with the keys that will update, and the values they will update to
	 * @param patch is a function that mutates `row` to have the new values. `patch` is required to be called during this implementation
	 * @returns a function that sends notifications to observers
	 */
	changeRow(
		row: Row<S>,
		oldValues: Readonly<Partial<Row<S>>>,
		newValues: Readonly<Partial<Row<S>>>,
		patch: (row: Row<S>) => void,
	): () => void
}
