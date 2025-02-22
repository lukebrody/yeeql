import { UUID, Field, Table, QueryChange } from 'index'
import * as Y from 'yjs'

import { beforeEach, test, mock } from 'node:test'
import assert from 'assert/strict'
import { LinearQuery } from 'yeeql/query/interface/LinearQuery'

const child = {
	id: new Field<UUID>(),
	parentId: new Field<UUID>(),
	order: new Field<number>(),
}

const parent = {
	id: new Field<UUID>(),
	order: new Field<number>(),
}

let doc: Y.Doc
let yChildren: Y.Map<Y.Map<unknown>>
let yParents: Y.Map<Y.Map<unknown>>
let children: Table<typeof child>
let parents: Table<typeof parent>

beforeEach(() => {
	doc = new Y.Doc()
	yChildren = doc.getMap('children') as Y.Map<Y.Map<unknown>>
	yParents = doc.getMap('parents') as Y.Map<Y.Map<unknown>>
	children = new Table(yChildren, child, 'children')
	parents = new Table(yParents, parent, 'parents')
})

test('subquery read', () => {
	const parentId = parents.insert({ order: 0 })
	const childId = children.insert({ parentId, order: 0 })

	const query = children.query({
		subqueries: {
			parent: (child) => parents.query({ filter: { id: child.parentId } }),
		},
	})

	assert.deepEqual(query.result, [
		{ id: childId, order: 0, parentId, parent: [{ id: parentId, order: 0 }] },
	])
})

test('subquery update', () => {
	const query = children.query({
		subqueries: {
			parent: (child) => parents.query({ filter: { id: child.parentId } }),
		},
	})

	const parentId = parents.insert({ order: 0 })
	const wrongId = UUID.create()
	const childId = children.insert({ parentId: wrongId, order: 0 })

	assert.deepEqual(query.result, [
		{ id: childId, parentId: wrongId, parent: [], order: 0 },
	])

	children.update(childId, 'parentId', parentId)

	assert.deepEqual(query.result, [
		{ id: childId, parentId, parent: [{ id: parentId, order: 0 }], order: 0 },
	])

	assert.equal(query.result[0].parent[0].id, parentId) // Type checking
	assert.equal(query.result[0].id, childId) // Type checking
	assert.equal(query.result[0].parentId, parentId) // Type checking
})

test('subquery sort', () => {
	const query = parents.query({
		subqueries: {
			children: (parent) =>
				children.query({
					filter: { parentId: parent.id },
					sort: (a, b) => a.order - b.order,
				}),
		},
		sort: (a, b) =>
			a.children.length === b.children.length
				? a.order - b.order
				: a.children.length - b.children.length,
	})

	const parentA = parents.insert({ order: 0 })
	const parentB = parents.insert({ order: 1 })

	const child1 = children.insert({ parentId: parentA, order: 0 })

	assert.deepEqual(query.result, [
		{ id: parentB, children: [], order: 1 },
		{
			id: parentA,
			children: [{ id: child1, parentId: parentA, order: 0 }],
			order: 0,
		},
	])

	const child2 = children.insert({ parentId: parentB, order: 1 })
	const child3 = children.insert({ parentId: parentB, order: 2 })

	assert.deepEqual(query.result, [
		{
			id: parentA,
			children: [{ id: child1, parentId: parentA, order: 0 }],
			order: 0,
		},
		{
			id: parentB,
			children: [
				{ id: child2, parentId: parentB, order: 1 },
				{ id: child3, parentId: parentB, order: 2 },
			],
			order: 1,
		},
	])
})

test('subquery changes', () => {
	const query = parents.query({
		subqueries: {
			children: (parent) =>
				children.query({
					filter: { parentId: parent.id },
					sort: (a, b) => a.order - b.order,
				}),
		},
		sort: (a, b) =>
			a.children.length === b.children.length
				? a.order - b.order
				: a.children.length - b.children.length,
	})

	let changes: QueryChange<typeof query>[] = []
	query.observe((change) => changes.push(JSON.parse(JSON.stringify(change))))

	const parentA = parents.insert({ order: 0 })
	const parentB = parents.insert({ order: 1 })

	assert.deepEqual(changes, [
		{
			kind: 'add',
			newIndex: 0,
			row: {
				children: [],
				id: parentA,
				order: 0,
			},
			type: 'add',
		},
		{
			kind: 'add',
			newIndex: 1,
			row: {
				children: [],
				id: parentB,
				order: 1,
			},
			type: 'add',
		},
	])

	changes = []

	const child1 = children.insert({ parentId: parentA, order: 0 })

	assert.deepEqual(changes, [
		{
			kind: 'subquery',
			newIndex: 1,
			oldIndex: 0,
			row: {
				children: [
					{
						id: child1,
						order: 0,
						parentId: parentA,
					},
				],
				id: parentA,
				order: 0,
			},
			change: {
				kind: 'add',
				newIndex: 0,
				row: {
					id: child1,
					order: 0,
					parentId: parentA,
				},
				type: 'add',
			},
			key: 'children',
			type: 'update',
		},
	])
	changes = []

	const child2 = children.insert({ parentId: parentB, order: 1 })
	const child3 = children.insert({ parentId: parentB, order: 2 })

	assert.deepEqual(changes, [
		{
			kind: 'subquery',
			newIndex: 1,
			oldIndex: 0,
			row: {
				children: [
					{
						id: child2,
						order: 1,
						parentId: parentB,
					},
				],
				id: parentB,
				order: 1,
			},
			change: {
				kind: 'add',
				newIndex: 0,
				row: {
					id: child2,
					order: 1,
					parentId: parentB,
				},
				type: 'add',
			},
			key: 'children',
			type: 'update',
		},
		{
			kind: 'subquery',
			newIndex: 1,
			oldIndex: 1,
			row: {
				children: [
					{
						id: child2,
						order: 1,
						parentId: parentB,
					},
					{
						id: child3,
						order: 2,
						parentId: parentB,
					},
				],
				id: parentB,
				order: 1,
			},
			change: {
				kind: 'add',
				newIndex: 1,
				row: {
					id: child3,
					order: 2,
					parentId: parentB,
				},
				type: 'add',
			},
			key: 'children',
			type: 'update',
		},
	])
})

test('subquery sort update', () => {
	const query = parents.query({
		subqueries: {
			children: (parent) =>
				children.query({
					filter: { parentId: parent.id },
					sort: (a, b) => a.order - b.order,
				}),
		},
		// Sort by child with the greatest order
		sort: (a, b) => {
			if (a.children.length === 0 && b.children.length === 0) {
				return a.order - b.order
			} else if (a.children.length === 0) {
				return -1
			} else if (b.children.length === 0) {
				return 1
			} else {
				return (
					a.children[a.children.length - 1].order -
					b.children[b.children.length - 1].order
				)
			}
		},
	})

	const parentA = parents.insert({ order: 0 })
	const parentB = parents.insert({ order: 1 })

	const child1 = children.insert({ parentId: parentA, order: 1 })
	const child2 = children.insert({ parentId: parentB, order: 0 })

	assert.deepEqual(query.result, [
		{
			children: [
				{
					id: child2,
					order: 0,
					parentId: parentB,
				},
			],
			id: parentB,
			order: 1,
		},
		{
			children: [
				{
					id: child1,
					order: 1,
					parentId: parentA,
				},
			],
			id: parentA,
			order: 0,
		},
	])

	const changes: QueryChange<typeof query>[] = []
	query.observe((change) => changes.push(JSON.parse(JSON.stringify(change))))

	// Expect order to flip when child2 weight is increased
	children.update(child2, 'order', 2)

	assert.deepEqual(query.result, [
		{
			children: [
				{
					id: child1,
					order: 1,
					parentId: parentA,
				},
			],
			id: parentA,
			order: 0,
		},
		{
			children: [
				{
					id: child2,
					order: 2,
					parentId: parentB,
				},
			],
			id: parentB,
			order: 1,
		},
	])

	assert.deepEqual(changes, [
		{
			kind: 'subquery',
			newIndex: 1,
			oldIndex: 0,
			row: {
				children: [
					{
						id: child2,
						order: 2,
						parentId: parentB,
					},
				],
				id: parentB,
				order: 1,
			},
			change: {
				kind: 'update',
				newIndex: 0,
				oldIndex: 0,
				oldValues: {
					order: 0,
				},
				row: {
					id: child2,
					order: 2,
					parentId: parentB,
				},
				type: 'update',
			},
			key: 'children',
			type: 'update',
		},
	])
})

test('subquery on self', () => {
	const query = children.query({
		subqueries: {
			siblings: (child) =>
				children.query({
					filter: { parentId: child.parentId },
					sort: (a, b) => a.order - b.order,
				}),
		},
		// Sort by child with the greatest order
		sort: (a, b) => a.order - b.order,
	})

	const parentA = parents.insert({ order: 0 })
	const parentB = parents.insert({ order: 1 })

	const child1 = children.insert({ parentId: parentA, order: 0 })
	const child2 = children.insert({ parentId: parentB, order: 1 })

	assert.deepEqual(query.result, [
		{
			siblings: [
				{
					id: child1,
					order: 0,
					parentId: parentA,
				},
			],
			id: child1,
			order: 0,
			parentId: parentA,
		},
		{
			siblings: [
				{
					id: child2,
					order: 1,
					parentId: parentB,
				},
			],
			id: child2,
			order: 1,
			parentId: parentB,
		},
	])

	children.update(child2, 'parentId', parentA)

	assert.deepEqual(query.result, [
		{
			siblings: [
				{
					id: child1,
					order: 0,
					parentId: parentA,
				},
				{
					id: child2,
					order: 1,
					parentId: parentA,
				},
			],
			id: child1,
			order: 0,
			parentId: parentA,
		},
		{
			siblings: [
				{
					id: child1,
					order: 0,
					parentId: parentA,
				},
				{
					id: child2,
					order: 1,
					parentId: parentA,
				},
			],
			id: child2,
			order: 1,
			parentId: parentA,
		},
	])
})

test('deep subquery', () => {
	const query = parents.query({
		subqueries: {
			children: (parent) =>
				children.query({
					filter: { parentId: parent.id },
					subqueries: {
						parents: (child) =>
							parents.query({ filter: { id: child.parentId } }),
					},
				}),
		},
		sort: (a, b) => a.order - b.order,
	})

	const parentA = parents.insert({ order: 0 })
	const child1 = children.insert({ parentId: parentA, order: 0 })

	assert.deepEqual(query.result, [
		{
			id: parentA,
			order: 0,
			children: [
				{
					id: child1,
					order: 0,
					parentId: parentA,
					parents: [
						{
							id: parentA,
							order: 0,
						},
					],
				},
			],
		},
	])

	const parentB = parents.insert({ order: 1 })

	children.update(child1, 'parentId', parentB)

	assert.deepEqual(query.result, [
		{ id: parentA, order: 0, children: [] },
		{
			id: parentB,
			order: 1,
			children: [
				{
					id: child1,
					order: 0,
					parentId: parentB,
					parents: [
						{
							id: parentB,
							order: 1,
						},
					],
				},
			],
		},
	])

	const changes: QueryChange<typeof query>[] = []
	query.observe((change) => changes.push(JSON.parse(JSON.stringify(change))))

	children.update(child1, 'parentId', parentA)
})

test('subquery multiple updates', () => {
	const query = parents.query({
		subqueries: {
			children: (parent) =>
				children.query({
					filter: { parentId: parent.id },
					sort: (a, b) => a.order - b.order,
				}),
			childrenByOrder: (parent) =>
				children.query({ filter: { parentId: parent.id }, groupBy: 'order' }),
		},
		sort: (a, b) => a.order - b.order,
	})

	const parentA = parents.insert({ order: 0 })
	const child1 = children.insert({ parentId: parentA, order: 0 })
	const child2 = children.insert({ parentId: parentA, order: 1 })

	assert.deepEqual(
		query.result.map((row) => ({
			...row,
			childrenByOrder: Array.from(row.childrenByOrder.entries()),
		})),
		[
			{
				id: parentA,
				order: 0,
				children: [
					{ id: child1, order: 0, parentId: parentA },
					{ id: child2, order: 1, parentId: parentA },
				],
				childrenByOrder: [
					[0, [{ id: child1, order: 0, parentId: parentA }]],
					[1, [{ id: child2, order: 1, parentId: parentA }]],
				],
			},
		],
	)

	let parentB = UUID.create()
	doc.transact(() => {
		parentB = parents.insert({ order: -1 })
		children.update(child2, 'order', -1)
		children.update(child2, 'parentId', parentB)
	})

	assert.deepEqual(
		query.result.map((row) => ({
			...row,
			childrenByOrder: Array.from(row.childrenByOrder.entries()),
		})),
		[
			{
				id: parentB,
				order: -1,
				children: [{ id: child2, order: -1, parentId: parentB }],
				childrenByOrder: [[-1, [{ id: child2, order: -1, parentId: parentB }]]],
			},
			{
				id: parentA,
				order: 0,
				children: [{ id: child1, order: 0, parentId: parentA }],
				childrenByOrder: [[0, [{ id: child1, order: 0, parentId: parentA }]]],
			},
		],
	)
})

test('subquery dependencies', () => {
	let childrenSubqueryCount = 0
	let sameOrderSubqueryCount = 0

	parents.query({
		subqueries: {
			children: (parent) => {
				childrenSubqueryCount++
				return children.query({
					filter: { parentId: parent.id },
					sort: (a, b) => a.order - b.order,
				})
			},
			sameOrder: (parent) => {
				sameOrderSubqueryCount++
				return children.count({ filter: { order: parent.order } })
			},
		},
	})

	const parentA = parents.insert({ order: 0 })
	children.insert({ parentId: parentA, order: 0 })

	childrenSubqueryCount = 0
	sameOrderSubqueryCount = 0

	parents.update(parentA, 'order', 1)

	assert.equal(childrenSubqueryCount, 0)
	assert.equal(sameOrderSubqueryCount, 1)
})

// The Table query cache should be used for subqueries
test('subquery cache', () => {
	const query = children.query({
		subqueries: {
			parent: (child) => parents.query({ filter: { id: child.parentId } }),
		},
	})

	const parentA = parents.insert({ order: 0 })
	children.insert({ parentId: parentA, order: 0 })
	children.insert({ parentId: parentA, order: 1 })

	// If the subqueries have the same result array, they are the same query
	assert.equal(query.result[0].parent === query.result[1].parent, true)
})

test('self referential', () => {
	assert.throws(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const query: LinearQuery<any, any, any> = children.query({
			subqueries: {
				children: () => query,
			},
		})
	})
})

test('resuse key', () => {
	assert.throws(
		() => {
			children.query({
				subqueries: {
					parentId: () => children.query({}),
				},
			})
		},
		new Error(
			// eslint-disable-next-line quotes
			"key 'parentId' may not be reused for a subquery, since it's already in the schema",
		),
	)
})

test('makes the same query on update', () => {
	const query = parents.query({
		subqueries: {
			count: ({ order }) =>
				!isNaN(order)
					? children.count({})
					: children.count({ groupBy: 'parentId' }),
		},
	})

	const parentId = parents.insert({ order: 0 })
	parents.update(parentId, 'order', 1)

	const observer = mock.fn()
	query.observe(observer)

	children.insert({ parentId, order: 0 })

	assert.equal(query.result[0].count, 1)
	assert.deepEqual(
		observer.mock.calls.map((c) => c.arguments),
		[
			[
				{
					change: {
						delta: 1,
						type: 'add',
					},
					key: 'count',
					kind: 'subquery',
					newIndex: 0,
					oldIndex: 0,
					row: {
						count: 1,
						id: parentId,
						order: 1,
					},
					type: 'update',
				},
			],
		],
	)
})

test('resuse key', () => {
	assert.throws(
		() => {
			children.query({
				subqueries: {
					parents: (child) =>
						parents.query({
							filter: { id: (child as unknown as { foo: UUID }).foo },
						}),
				},
			})
		},
		new Error(
			// eslint-disable-next-line quotes
			"unknown column 'foo' used in subquery generator",
		),
	)
})
