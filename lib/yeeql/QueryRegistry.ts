import { DefaultMap } from '../common/DefaultMap'
import { Filter, Row, Schema } from './Schema'

const notSpecified = Symbol()
type NotSpecified = typeof notSpecified

export const addedOrRemoved = Symbol()
type AddedOrRemoved = typeof addedOrRemoved

type QueryTreeNode<S extends Schema> = DefaultMap<unknown | NotSpecified, QueryTree<S>>
type QueryTreeLeaf<S extends Schema> = DefaultMap<keyof S | AddedOrRemoved, Array<WeakRef<QueryRegistryEntry<S>>>>
type QueryTree<S extends Schema> = QueryTreeNode<S> | QueryTreeLeaf<S>

function buildQueryTree<S extends Schema>(fields: ReadonlyArray<keyof S>): QueryTree<S> {
	if (fields.length == 0) {
		const result: QueryTreeLeaf<S> = new DefaultMap(() => [])
		return result
	} else {
		const result: QueryTreeNode<S> = new DefaultMap(() => buildQueryTree(fields.slice(1)))
		return result
	}
}

function insertIntoQueryTree<S extends Schema>(qt: QueryTree<S>, fields: ReadonlyArray<keyof S>, query: QueryRegistryEntry<S>): void {
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
		const key = fields[0] in query.filter ? query.filter[fields[0] as keyof typeof query.filter] : notSpecified
		insertIntoQueryTree(node.get(key), fields.slice(1), query)
	}
}

function deleteFromQueryTree<S extends Schema>(qt: QueryTree<S>, fields: ReadonlyArray<keyof S>, filter: Filter<S>): void {
	if (fields.length == 0) {
		const leaf = qt as QueryTreeLeaf<S>
		for (const [key, arr] of leaf) {
			for (let i = 0; i < arr.length;) {
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
		const key = fields[0] in filter ? fields[0] : notSpecified
		const child = node.get(key)
		deleteFromQueryTree(child, fields.slice(1), filter)
		if (child.size == 0) {
			node.delete(key)
		}
	}
}

function collectFromQueryTree<S extends Schema>(qt: QueryTree<S>, fields: ReadonlyArray<keyof S>, row: Row<S>, changed: AddedOrRemoved | Partial<Row<S>>, result: Set<QueryRegistryEntry<S>>): void {
	if (fields.length === 0) {
		const leaf = qt as QueryTreeLeaf<S>
		for (const key of changed === addedOrRemoved ? [addedOrRemoved] as Array<AddedOrRemoved> : Object.keys(changed)) {
			for (const weakQuery of leaf.get(key)) {
				const query = weakQuery.deref()
				if (query) {
					result.add(query)
				}
			}
		}
	} else {
		const node = qt as QueryTreeNode<S>
		collectFromQueryTree(node.get(notSpecified), fields.slice(1), row, changed, result)
		if (node.has(row[fields[0]])) {
			return collectFromQueryTree(node.get(row[fields[0]]), fields.slice(1), row, changed, result)
		}
	}
}

export class QueryRegistry<S extends Schema> {
	private readonly finalizer = new FinalizationRegistry<Filter<S>>(filter => deleteFromQueryTree(this.qt, this.fields, filter))

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

	queries(row: Row<S>, changes: Partial<Row<S>> | AddedOrRemoved): Set<QueryRegistryEntry<S>> {
		const result = new Set<QueryRegistryEntry<S>>()
		collectFromQueryTree(this.qt, this.fields, row, changes, result)
		return result
	}
}

export interface QueryRegistryEntry<S extends Schema> {
	readonly filter: Readonly<Filter<S>>, // Values that old or new need to match
	readonly select: ReadonlySet<keyof S> // Other fields that we care about changing

	// We use three stages here so that observers get a consistent state across all queries
	// As well as so all queries can share the same row instanes

	doItemAdd(row: Row<S>): void
	postItemAdd(row: Row<S>, type: 'add' | 'update'): void

	doItemRemove(row: Row<S>): void // From this query, if it's moving somewhere else
	postItemRemove(row: Row<S>, type: 'delete' | 'update'): void

	postItemChange(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>): void // Notify observers
}