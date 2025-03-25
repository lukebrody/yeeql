import { UUID, Field, Table, QueryChange } from 'index'
import * as Y from 'yjs'

import { beforeEach, test, Mock, mock } from 'node:test'
import assert from 'assert/strict'

const schema = {
	id: new Field<UUID>(),
	number: new Field<number>(),
	string: new Field<string>(),
}

let doc: Y.Doc
let yTable: Y.Map<Y.Map<unknown>>
let table: Table<typeof schema>
let query: ReturnType<typeof table.count>
let spy: Mock<(change: QueryChange<typeof query>) => void>

beforeEach(() => {
	doc = new Y.Doc()
	yTable = doc.getMap('table') as Y.Map<Y.Map<unknown>>
	table = new Table(yTable, schema)
	query = table.count({ groupBy: 'number', filter: { string: 'a' } })
	spy = mock.fn()
	query.observe(spy)
})

function popChanges() {
	const result = spy.mock.calls.map((calls) => calls.arguments[0])
	spy.mock.resetCalls()
	return result
}

test('grouped count query result', () => {
	const query = table.count({ groupBy: 'number', filter: { string: 'a' } })

	table.insert({ number: 1, string: 'b' })

	assert.equal(query.result.size, 0)
	assert.deepEqual(popChanges(), [])

	const row2 = table.insert({ number: 1, string: 'a' })

	assert.equal(query.result.size, 1)
	assert.equal(query.result.get(1), 1)
	assert.deepEqual(popChanges(), [
		{
			group: 1,
			kind: 'addGroup',
			result: 1,
			type: 'add',
		},
	])

	const row3 = table.insert({ number: 1, string: 'a' })

	assert.equal(query.result.size, 1)
	assert.equal(query.result.get(1), 2)
	assert.deepEqual(popChanges(), [
		{
			change: {
				delta: 1,
				type: 'add',
			},
			group: 1,
			kind: 'subquery',
			result: 2,
			type: 'add',
		},
	])

	const row4 = table.insert({ number: 2, string: 'a' })

	assert.equal(query.result.size, 2)
	assert.equal(query.result.get(1), 2)
	assert.equal(query.result.get(2), 1)
	assert.deepEqual(popChanges(), [
		{
			group: 2,
			kind: 'addGroup',
			result: 1,
			type: 'add',
		},
	])

	table.update(row3, 'number', 2)

	assert.equal(query.result.size, 2)
	assert.equal(query.result.get(1), 1)
	assert.equal(query.result.get(2), 2)
	assert.deepEqual(popChanges(), [
		{
			change: {
				delta: -1,
				type: 'update',
			},
			group: 1,
			kind: 'subquery',
			result: 1,
			type: 'update',
		},
		{
			change: {
				delta: 1,
				type: 'update',
			},
			group: 2,
			kind: 'subquery',
			result: 2,
			type: 'update',
		},
	])

	table.update(row3, 'string', 'b')

	assert.equal(query.result.size, 2)
	assert.equal(query.result.get(1), 1)
	assert.equal(query.result.get(2), 1)
	assert.deepEqual(popChanges(), [
		{
			change: {
				delta: -1,
				type: 'update',
			},
			group: 2,
			kind: 'subquery',
			result: 1,
			type: 'update',
		},
	])

	table.update(row2, 'number', 2)

	assert.equal(query.result.size, 1)
	assert.equal(query.result.get(1), 0)
	assert.equal(query.result.get(2), 2)
	assert.deepEqual(popChanges(), [
		{
			change: {
				delta: -1,
				type: 'update',
			},
			group: 1,
			kind: 'subquery',
			result: 0,
			type: 'update',
		},
		{
			group: 1,
			kind: 'removeGroup',
			result: 0,
			type: 'update',
		},
		{
			change: {
				delta: 1,
				type: 'update',
			},
			group: 2,
			kind: 'subquery',
			result: 2,
			type: 'update',
		},
	])

	table.delete(row2)

	assert.equal(query.result.size, 1)
	assert.equal(query.result.get(1), 0)
	assert.equal(query.result.get(2), 1)
	assert.deepEqual(popChanges(), [
		{
			change: {
				delta: -1,
				type: 'delete',
			},
			group: 2,
			kind: 'subquery',
			result: 1,
			type: 'delete',
		},
	])

	table.update(row4, 'number', 1)

	assert.equal(query.result.size, 1)
	assert.equal(query.result.get(1), 1)
	assert.equal(query.result.get(2), 0)

	assert.deepEqual(popChanges(), [
		{
			change: {
				delta: -1,
				type: 'update',
			},
			group: 2,
			kind: 'subquery',
			result: 0,
			type: 'update',
		},
		{
			group: 2,
			kind: 'removeGroup',
			result: 0,
			type: 'update',
		},
		{
			group: 1,
			kind: 'addGroup',
			result: 0,
			type: 'update',
		},
		{
			change: {
				delta: 1,
				type: 'update',
			},
			group: 1,
			kind: 'subquery',
			result: 1,
			type: 'update',
		},
	])
})

test('grouped count delete change', () => {
	const row1 = table.insert({ number: 1, string: 'a' })

	table.delete(row1)

	assert.deepEqual(popChanges(), [
		{
			group: 1,
			kind: 'addGroup',
			result: 1,
			type: 'add',
		},
		{
			group: 1,
			kind: 'removeGroup',
			result: 1,
			type: 'delete',
		},
	])
})
