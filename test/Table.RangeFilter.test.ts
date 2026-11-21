import { UUID, Field, Table } from 'index'
import * as Y from 'yjs'

import { beforeEach, test } from 'node:test'
import assert from 'assert/strict'

const schema = {
	id: new Field<UUID>(),
	number: new Field<number>(),
	string: new Field<string>(),
	mixed: new Field<number | string>(),
	boolean: new Field<boolean>(),
	big: new Field<bigint | undefined>(),
}

let doc: Y.Doc
let yTable: Y.Map<Y.Map<unknown>>
let table: Table<typeof schema>

beforeEach(() => {
	doc = new Y.Doc()
	yTable = doc.getMap('table') as Y.Map<Y.Map<unknown>>
	table = new Table(yTable, schema)
})

const byNumber = (a: { number: number }, b: { number: number }) =>
	a.number - b.number

function insert(number: number, string = '', mixed: number | string = 0) {
	return table.insert({ number, string, mixed, boolean: false, big: undefined })
}

test('rows enter and leave a range', () => {
	const oneId = insert(1)
	insert(5)
	const query = table.query({
		select: ['number'],
		filter: { number: { gt: 1, lte: 5 } },
		sort: byNumber,
	})
	const lowQuery = table.query({
		select: ['number'],
		filter: { number: { lt: 3 } },
		sort: byNumber,
	})
	assert.deepEqual(
		query.result.map(({ number }) => number),
		[5],
	)
	assert.deepEqual(
		lowQuery.result.map(({ number }) => number),
		[1],
	)

	insert(3)
	insert(6)
	assert.deepEqual(
		query.result.map(({ number }) => number),
		[3, 5],
	)

	table.update(oneId, 'number', 2)
	assert.deepEqual(
		query.result.map(({ number }) => number),
		[2, 3, 5],
	)
	assert.deepEqual(
		lowQuery.result.map(({ number }) => number),
		[2],
	)

	table.update(oneId, 'number', 10)
	assert.deepEqual(
		query.result.map(({ number }) => number),
		[3, 5],
	)
	assert.deepEqual(lowQuery.result, [])

	table.update(oneId, 'number', NaN)
	assert.deepEqual(
		query.result.map(({ number }) => number),
		[3, 5],
	)
})

test('string ranges combined with literals', () => {
	insert(1, 'apple')
	insert(1, 'banana')
	insert(2, 'banana')
	const count = table.count({
		filter: { number: 1, string: { gte: 'b', lt: 'c' } },
	})
	assert.equal(count.result, 1)
	insert(1, 'blueberry')
	assert.equal(count.result, 2)
	insert(1, 'cherry')
	assert.equal(count.result, 2)
})

test('row values of a different type are outside the range', () => {
	insert(0, '', 1)
	insert(0, '', 'a')
	const numbers = table.count({ filter: { mixed: { gte: 0 } } })
	const strings = table.count({ filter: { mixed: { gte: 'a' } } })
	assert.equal(numbers.result, 1)
	assert.equal(strings.result, 1)
})

test('grouped query with a range', () => {
	insert(1, 'a')
	insert(2, 'a')
	insert(3, 'b')
	const grouped = table.query({
		select: ['number'],
		filter: { number: { gte: 2 } },
		groupBy: 'string',
		sort: byNumber,
	})
	assert.deepEqual(
		grouped.result.get('a').map(({ number }) => number),
		[2],
	)
	assert.deepEqual(
		grouped.result.get('b').map(({ number }) => number),
		[3],
	)
})

test('a NaN bound matches nothing', () => {
	const id = insert(1)
	const count = table.count({ filter: { number: { gt: NaN } } })
	assert.equal(count.result, 0)
	table.update(id, 'number', 2)
	assert.equal(count.result, 0)
})

test('non-finite bounds are distinct filters', () => {
	const id = insert(1)
	const belowInfinity = table.count({ filter: { number: { lt: Infinity } } })
	const belowNegativeInfinity = table.count({
		filter: { number: { lt: -Infinity } },
	})
	const belowNaN = table.query({
		select: ['number'],
		filter: { number: { lt: NaN } },
	})
	const belowInfinityQuery = table.query({
		select: ['number'],
		filter: { number: { lt: Infinity } },
	})
	assert.equal(belowInfinity.result, 1)
	assert.equal(belowNegativeInfinity.result, 0)
	assert.equal(belowNaN.result.length, 0)
	assert.equal(belowInfinityQuery.result.length, 1)

	insert(2)
	table.update(id, 'number', 3)
	assert.equal(belowInfinity.result, 2)
	assert.equal(belowNegativeInfinity.result, 0)
	assert.equal(belowNaN.result.length, 0)
	assert.equal(belowInfinityQuery.result.length, 2)
})

// Y.js 13.6.7 can't store bigints, so rows here never match
test('bigint range filters', () => {
	insert(1)
	const above = table.count({ filter: { big: { gt: 1n } } })
	assert.equal(above.result, 0)
	assert.equal(above, table.count({ filter: { big: { gt: 1n } } }))
	assert.notEqual(above, table.count({ filter: { big: { gt: 2n } } }))
})

test('invalid ranges are type errors', () => {
	// @ts-expect-error no bounds
	table.query({ filter: { number: {} } })
	// @ts-expect-error redundant lower bounds
	table.count({ filter: { number: { gt: 1, gte: 1 } } })
	// @ts-expect-error redundant upper bounds
	table.count({ filter: { number: { lt: 1, lte: 1 } } })
	// @ts-expect-error mixed bound types
	table.query({ filter: { mixed: { gt: 1, lt: 'a' } } })
	// @ts-expect-error booleans can't be ranged
	table.query({ filter: { boolean: { gt: true } } })
	table.query({ filter: { mixed: { gt: 1, lte: 2 } } })
	table.query({ filter: { mixed: { gte: 'a' } } })
})
