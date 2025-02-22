import { UUID, Field, Table, QueryChange } from 'index'
import * as Y from 'yjs'

import { test, beforeEach, mock, Mock } from 'node:test'
import assert from 'assert/strict'

const schema = {
	id: new Field<UUID>(),
	number: new Field<number>(),
	string: new Field<string>(),
}

let doc: Y.Doc
let yTable: Y.Map<Y.Map<unknown>>
let table: Table<typeof schema>
let query: ReturnType<typeof table.groupBy>
let spy: Mock<(change: QueryChange<typeof query>) => void>

beforeEach(() => {
	doc = new Y.Doc()
	yTable = doc.getMap('table') as Y.Map<Y.Map<unknown>>
	table = new Table(yTable, schema)
	query = table.groupBy({
		groupBy: 'number',
		subquery: (number) => table.count({ filter: { number } }),
	})
	spy = mock.fn()
	query.observe(spy)
})

function popChanges() {
	const result = spy.mock.calls.map((calls) => calls.arguments[0])
	spy.mock.resetCalls()
	return result
}

test('add query when already has data', () => {
	table.insert({ number: 1, string: 'a' })
	table.insert({ number: 1, string: 'b' })
	table.insert({ number: 2, string: 'a' })
	table.insert({ number: 2, string: 'b' })
	const query = table.groupBy({
		groupBy: 'number',
		subquery: (number) => table.count({ filter: { string: 'a', number } }),
	})
	assert.equal(query.result.size, 2)
	assert.equal(query.result.get(1), 1)
	assert.equal(query.result.get(2), 1)
})

test('nothing update', () => {
	const rowId = table.insert({ number: 1, string: 'a' })
	popChanges()
	table.update(rowId, 'number', 1)
	assert.deepEqual(popChanges(), [])
	assert.equal(query.result.size, 1)
})

test('iterators', () => {
	table.insert({ number: 1, string: 'a' })
	table.insert({ number: 2, string: 'a' })
	assert.deepEqual(Array.from(query.result), [
		[1, 1],
		[2, 1],
	])
	assert.deepEqual(Array.from(query.result.entries()), [
		[1, 1],
		[2, 1],
	])
	assert.deepEqual(Array.from(query.result.values()), [1, 1])

	const spy = mock.fn()
	query.result.forEach(spy)
	assert.deepEqual(
		spy.mock.calls.map((c) => c.arguments),
		[
			[1, 1, query.result],
			[1, 2, query.result],
		],
	)

	assert.equal(query.result.has(1), true)
	assert.equal(query.result.has(3), false)

	assert.deepEqual(Array.from(query.result.keys()), [1, 2])
})
