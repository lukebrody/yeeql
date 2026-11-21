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
	return table.insert({ number, string, mixed, boolean: false })
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

test('invalid ranges', () => {
	assert.throws(
		() => table.query({ filter: { number: {} } }),
		new Error('range for \'number\' has no bounds'),
	)
	assert.throws(
		() => table.count({ filter: { number: { gt: 1, gte: 1 } } }),
		new Error('range for \'number\' has redundant bounds'),
	)
	assert.throws(
		() =>
			table.groupBy({
				groupBy: 'string',
				filter: { number: { lt: 1, lte: 1 } },
				subquery: () => table.count({}),
			}),
		new Error('range for \'number\' has redundant bounds'),
	)
	const typeError = new Error(
		'range bounds for \'mixed\' must be all numbers, all strings, or all bigints',
	)
	assert.throws(
		() => table.query({ filter: { mixed: { gt: 1, lt: 'a' } } }),
		typeError,
	)
	assert.throws(
		() => table.query({ filter: { mixed: { gt: NaN } } }),
		typeError,
	)
	assert.throws(
		() =>
			table.query({
				// @ts-expect-error booleans can't be ranged
				filter: { boolean: { gt: true } },
			}),
		new Error(
			'range bounds for \'boolean\' must be all numbers, all strings, or all bigints',
		),
	)
})
