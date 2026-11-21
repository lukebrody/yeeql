import { UUID, Field, Table, QueryChange } from 'index'
import * as Y from 'yjs'

import { beforeEach, test } from 'node:test'
import assert from 'assert/strict'
import { _testQueryEntries } from 'yeeql/table/QueryRegistry'

const schema = {
	id: new Field<UUID>(),
	number: new Field<number>(),
	string: new Field<string>(),
}

let doc: Y.Doc
let yTable: Y.Map<Y.Map<unknown>>
let table: Table<typeof schema>

beforeEach(() => {
	doc = new Y.Doc()
	yTable = doc.getMap('table') as Y.Map<Y.Map<unknown>>
	table = new Table(yTable, schema)
})

test('insert', () => {
	const aId = table.insert({ number: 1, string: 'a' })

	const queryAll = table.query({
		select: ['id', 'number', 'string'],
		sort: (a, b) => a.number - b.number,
	})

	assert.deepEqual(queryAll.result, [{ id: aId, number: 1, string: 'a' }])

	const bId = table.insert({ number: 2, string: 'b' })

	assert.deepEqual(queryAll.result, [
		{ id: aId, number: 1, string: 'a' },
		{ id: bId, number: 2, string: 'b' },
	])

	table.update(aId, 'number', 3)

	assert.deepEqual(queryAll.result, [
		{ id: bId, number: 2, string: 'b' },
		{ id: aId, number: 3, string: 'a' },
	])
})

// TODO: Improve/add another this test to check additional cache layers
test('cached queries', () => {
	const queryA = table.query({
		select: ['id'],
		filter: { number: 3 },
	})

	const queryB = table.query({
		select: ['id'],
		filter: { number: 3 },
	})

	assert.equal(queryA, queryB)

	const sort = (a: { number: number }, b: { number: number }) =>
		a.number - b.number

	const queryC = table.query({
		select: ['id', 'string', 'number'],
		filter: { number: 3 },
		sort,
		groupBy: 'string',
	})

	const queryD = table.query({
		select: ['string', 'id'],
		filter: { number: 3 },
		sort,
		groupBy: 'string',
	})

	assert.equal(queryC, queryD)

	assert.notEqual(queryA, queryC)
	assert.notEqual(queryB, queryD)
})

test('already has data', () => {
	table.insert({ number: 0, string: 'a' })

	const table2 = new Table(yTable, schema)
	assert.equal(table2.count({}).result, 1)
})

test('memory management', async () => {
	let query: ReturnType<typeof table.query> | undefined = table.query({})
	const weakQuery = new WeakRef(query)
	query = undefined

	await new Promise((resolve) => setTimeout(resolve, 10))
	global.gc!()
	await new Promise((resolve) => setTimeout(resolve, 10))

	assert.equal(weakQuery.deref(), undefined)
})

test('an undefined filter value is not the same as no filter', () => {
	const optionalTable = new Table(
		doc.getMap('optional') as Y.Map<Y.Map<unknown>>,
		{ id: new Field<UUID>(), number: new Field<number | undefined>() },
	)
	optionalTable.insert({ number: 1 })
	optionalTable.insert({ number: undefined })
	const undefinedCount = optionalTable.count({ filter: { number: undefined } })
	const allCount = optionalTable.count({})
	assert.equal(undefinedCount.result, 1)
	assert.equal(allCount.result, 2)
})

test('a NaN filter value matches NaN rows', () => {
	table.insert({ number: NaN, string: 'a' })
	table.insert({ number: 1, string: 'b' })
	const count = table.count({ filter: { number: NaN } })
	assert.equal(count.result, 1)
	table.insert({ number: NaN, string: 'c' })
	assert.equal(count.result, 2)
})

test('inherited object properties are not columns', () => {
	assert.throws(
		// @ts-expect-error not a column
		() => table.query({ filter: { toString: 1 } }),
		/unknown column 'toString'/,
	)
	assert.throws(
		// @ts-expect-error not a column
		() => table.query({ sort: (a, b) => a.toString - b.toString }),
		/unknown column 'toString'/,
	)
})

test('cached count queries are registered once', () => {
	const count = table.count({ filter: { string: 'a' } })
	table.count({ filter: { string: 'a' } })
	_testQueryEntries.value = 0
	table.insert({ number: 1, string: 'a' })
	assert.equal(count.result, 1)
	assert.equal(_testQueryEntries.value, 1)
})

test('groupBy validates its columns', () => {
	assert.throws(
		// @ts-expect-error not a column
		() => table.groupBy({ groupBy: 'nope', subquery: () => table.count({}) }),
		/unknown column 'nope'/,
	)
	assert.throws(
		() =>
			table.groupBy({
				groupBy: 'number',
				// @ts-expect-error not a column
				filter: { nope: 1 },
				subquery: () => table.count({}),
			}),
		/unknown column 'nope'/,
	)
})

test('sort comparators must read selected columns unconditionally', () => {
	const query = table.query({
		select: ['string'],
		sort: (a, b) => (a.string === 'x' ? a.number - b.number : 0),
	})
	table.insert({ number: 1, string: 'y' })
	assert.throws(
		() => table.insert({ number: 2, string: 'x' }),
		/sort comparator read column 'number'/,
	)
	assert.equal(query.result.length, 2)
})

test('a missed read reports after the rest of the transaction applies', () => {
	const query = table.query({
		select: ['string'],
		sort: (a, b) => (a.string === 'x' ? a.number - b.number : 0),
	})
	let changes = 0
	query.observe(() => changes++)
	const count = table.count({})
	table.insert({ number: 1, string: 'x' })

	assert.throws(
		() =>
			doc.transact(() => {
				table.insert({ number: 2, string: 'x' })
				table.insert({ number: 3, string: 'z' })
			}),
		/sort comparator read column 'number'/,
	)
	assert.equal(query.result.length, 3)
	assert.equal(changes, 3)
	assert.equal(count.result, 3)
	assert.equal(table.count({ filter: { string: 'z' } }).result, 1)
})

test('a sort that throws on a row leaves it out until the row changes', () => {
	const count = table.count({})
	let countChanges = 0
	count.observe(() => countChanges++)
	const query = table.query({
		sort: (a, b) => {
			if (a.string === 'boom' || b.string === 'boom') {
				throw new Error('boom')
			}
			return a.number - b.number
		},
	})
	let queryChanges = 0
	query.observe(() => queryChanges++)
	table.insert({ number: 1, string: 'a' })

	let boomId!: UUID
	assert.throws(
		() =>
			doc.transact(() => {
				boomId = table.insert({ number: 2, string: 'boom' })
				table.insert({ number: 3, string: 'b' })
			}),
		/boom/,
	)
	assert.equal(count.result, 3)
	assert.equal(countChanges, 3)
	assert.deepEqual(
		query.result.map((row) => row.number),
		[1, 3],
	)
	assert.equal(queryChanges, 2)

	table.update(boomId, 'string', 'c')
	assert.deepEqual(
		query.result.map((row) => row.number),
		[1, 2, 3],
	)
	table.delete(boomId)
	table.insert({ number: 4, string: 'd' })
	assert.deepEqual(
		query.result.map((row) => row.number),
		[1, 3, 4],
	)
	assert.equal(queryChanges, 5)
	assert.equal(countChanges, 5)
})

test('a sort that throws while moving a row drops it from the result', () => {
	let throwing = false
	const query = table.query({
		sort: (a, b) => {
			if (throwing) {
				throw new Error('boom')
			}
			return a.number - b.number
		},
	})
	const changes: QueryChange<typeof query>[] = []
	query.observe((change) => changes.push(change))
	const count = table.count({})
	let countChanges = 0
	count.observe(() => countChanges++)
	const aId = table.insert({ number: 1, string: 'a' })
	table.insert({ number: 2, string: 'b' })

	throwing = true
	assert.throws(() => table.update(aId, 'number', 3), /boom/)
	throwing = false
	assert.deepEqual(
		query.result.map((row) => row.string),
		['b'],
	)
	assert.equal(changes.length, 3)
	assert.equal(changes[2].kind, 'remove')

	table.delete(aId)
	table.insert({ number: 0, string: 'c' })
	assert.deepEqual(
		query.result.map((row) => row.string),
		['c', 'b'],
	)
	assert.equal(countChanges, 4)
})

test('a subquery generator that throws on an update leaves its old subquery working', () => {
	const query = table.query({
		subqueries: {
			same: (row) => {
				if (row.string === 'boom') {
					throw new Error('boom')
				}
				return table.count({ filter: { string: row.string } })
			},
		},
		sort: (a, b) => a.number - b.number,
	})
	const countA = table.count({ filter: { string: 'a' } })
	let countAChanges = 0
	countA.observe(() => countAChanges++)
	const id = table.insert({ number: 1, string: 'a' })

	assert.throws(() => table.update(id, 'string', 'boom'), /boom/)
	table.insert({ number: 2, string: 'a' })
	table.insert({ number: 3, string: 'a' })
	assert.equal(countAChanges, 4)
	assert.deepEqual(
		query.result.map((row) => [row.number, row.same]),
		[
			[2, 2],
			[3, 2],
		],
	)

	table.update(id, 'string', 'a')
	assert.deepEqual(
		query.result.map((row) => [row.number, row.same]),
		[
			[1, 3],
			[2, 3],
			[3, 3],
		],
	)
	table.delete(id)
	assert.equal(countAChanges, 6)
	assert.equal(query.result.length, 2)
})

test('a subquery generator that throws on an add leaves its other subqueries unobserved', () => {
	const query = table.query({
		subqueries: {
			all: () => table.count({}),
			same: (row) => {
				if (row.string === 'boom') {
					throw new Error('boom')
				}
				return table.count({ filter: { string: row.string } })
			},
		},
	})
	const all = table.count({})
	let allChanges = 0
	all.observe(() => allChanges++)

	let boomId!: UUID
	assert.throws(
		() =>
			doc.transact(() => {
				boomId = table.insert({ number: 1, string: 'boom' })
			}),
		/boom/,
	)
	table.insert({ number: 2, string: 'a' })
	table.insert({ number: 3, string: 'a' })
	table.delete(boomId)
	assert.equal(allChanges, 4)
	assert.deepEqual(
		query.result.map((row) => row.all),
		[2, 2],
	)
})

test('a sort that throws on an add leaves the row unobserving its subqueries', () => {
	const query = table.query({
		subqueries: { all: () => table.count({}) },
		sort: (a, b) => {
			if (a.string === 'boom' || b.string === 'boom') {
				throw new Error('boom')
			}
			return a.number - b.number
		},
	})
	const all = table.count({})
	let allChanges = 0
	all.observe(() => allChanges++)
	table.insert({ number: 1, string: 'a' })

	assert.throws(() => table.insert({ number: 2, string: 'boom' }), /boom/)
	table.insert({ number: 3, string: 'b' })
	assert.equal(allChanges, 3)
	assert.deepEqual(
		query.result.map((row) => [row.number, row.all]),
		[
			[1, 3],
			[3, 3],
		],
	)
})

test('a sort that throws while a subquery changes drops the row', () => {
	let throwing = false
	const query = table.query({
		filter: { number: 1 },
		subqueries: {
			same: (row) => table.count({ filter: { string: row.string } }),
		},
		sort: (a, b) => {
			if (throwing) {
				throw new Error('boom')
			}
			return a.same - b.same
		},
	})
	const changes: QueryChange<typeof query>[] = []
	query.observe((change) => changes.push(change))
	const all = table.count({})
	let allChanges = 0
	all.observe(() => allChanges++)
	const aId = table.insert({ number: 1, string: 'a' })
	table.insert({ number: 1, string: 'b' })

	throwing = true
	assert.throws(() => table.insert({ number: 2, string: 'a' }), /boom/)
	throwing = false
	assert.deepEqual(
		query.result.map((row) => row.string),
		['b'],
	)
	assert.equal(changes.length, 3)
	assert.equal(changes[2].kind, 'remove')

	table.insert({ number: 3, string: 'a' })
	table.update(aId, 'string', 'c')
	assert.deepEqual(query.result.map((row) => row.string).sort(), ['b', 'c'])
	assert.equal(allChanges, 4)
})

test('a groupBy subquery that throws leaves its group out', () => {
	const query = table.groupBy({
		groupBy: 'string',
		subquery: (string) => {
			if (string === 'boom') {
				throw new Error('boom')
			}
			return table.count({ filter: { string } })
		},
	})
	const all = table.count({})
	let allChanges = 0
	all.observe(() => allChanges++)
	const aId = table.insert({ number: 1, string: 'a' })

	let boomId!: UUID
	assert.throws(
		() =>
			doc.transact(() => {
				boomId = table.insert({ number: 2, string: 'boom' })
			}),
		/boom/,
	)
	assert.deepEqual([...query.result.keys()], ['a'])
	table.delete(boomId)

	assert.throws(() => table.update(aId, 'string', 'boom'), /boom/)
	assert.deepEqual([...query.result.keys()], [])
	table.update(aId, 'string', 'b')
	assert.deepEqual([...query.result.keys()], ['b'])
	assert.equal(allChanges, 3)
})

test('a missed read while creating a query throws immediately', () => {
	table.insert({ number: 1, string: 'x' })
	table.insert({ number: 2, string: 'x' })
	assert.throws(
		() =>
			table.query({
				select: ['string'],
				sort: (a, b) => (a.string === 'x' ? a.number - b.number : 0),
			}),
		/sort comparator read column 'number'/,
	)
})

test('sort comparators may branch to equality-filtered columns', () => {
	const query = table.query({
		select: ['string'],
		filter: { number: 1 },
		sort: (a, b) => (a.string === 'x' ? a.number - b.number : 0),
	})
	table.insert({ number: 1, string: 'x' })
	table.insert({ number: 1, string: 'x' })
	assert.equal(query.result.length, 2)
})

test('sort comparators may branch when every column is selected', () => {
	const query = table.query({
		sort: (a, b) => (a.string === 'x' ? a.number - b.number : 0),
	})
	table.insert({ number: 2, string: 'x' })
	table.insert({ number: 1, string: 'x' })
	assert.deepEqual(
		query.result.map(({ number }) => number),
		[1, 2],
	)
})
