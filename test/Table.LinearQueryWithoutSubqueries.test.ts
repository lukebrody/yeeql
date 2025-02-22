import { UUID, Field, Table } from 'index'
import * as Y from 'yjs'

import { beforeEach, test, mock } from 'node:test'
import assert from 'assert/strict'

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

test('multiple queries', () => {
	const bId = table.insert({ number: 1, string: 'b' })
	const sortByNumber = table.query({
		select: ['id', 'number', 'string'],
		sort: (a, b) => a.number - b.number,
	})
	const sortByString = table.query({
		select: ['id', 'number', 'string'],
		sort: (a, b) => a.string.localeCompare(b.string),
	})
	assert.deepEqual(sortByNumber.result, [{ id: bId, number: 1, string: 'b' }])
	assert.deepEqual(sortByString.result, [{ id: bId, number: 1, string: 'b' }])
	const aId = table.insert({ number: 2, string: 'a' })
	assert.deepEqual(sortByNumber.result, [
		{ id: bId, number: 1, string: 'b' },
		{ id: aId, number: 2, string: 'a' },
	])
	assert.deepEqual(sortByString.result, [
		{ id: aId, number: 2, string: 'a' },
		{ id: bId, number: 1, string: 'b' },
	])
	table.update(bId, 'number', 3)
	table.update(bId, 'string', '0')
	assert.deepEqual(sortByNumber.result, [
		{ id: aId, number: 2, string: 'a' },
		{ id: bId, number: 3, string: '0' },
	])
	assert.deepEqual(sortByString.result, [
		{ id: bId, number: 3, string: '0' },
		{ id: aId, number: 2, string: 'a' },
	])
})

test('filter', () => {
	const aId = table.insert({ number: 1, string: 'a' })
	table.insert({ number: 2, string: 'b' })

	const onlyOnes = table.query({
		select: ['id', 'number', 'string'],
		filter: { number: 1 },
		sort: (a, b) => a.string.localeCompare(b.string),
	})

	assert.deepEqual(onlyOnes.result, [{ id: aId, number: 1, string: 'a' }])

	let dId: UUID | undefined
	doc.transact(() => {
		table.insert({ number: 2, string: 'c' })
		dId = table.insert({ number: 1, string: 'd' })
	})

	assert.deepEqual(onlyOnes.result, [
		{ id: aId, number: 1, string: 'a' },
		{ id: dId, number: 1, string: 'd' },
	])
})

test('select', () => {
	const aId = table.insert({ number: 1, string: 'a' })

	const excludeString = table.query({
		select: ['id', 'number'],
		sort: (a, b) => a.number - b.number,
	})

	const observer = mock.fn()

	excludeString.observe(observer)

	table.update(aId, 'string', 'a1')

	assert.equal(observer.mock.callCount(), 0)

	table.update(aId, 'number', 2)

	assert.equal(observer.mock.callCount(), 1)
})

test('sorting', () => {
	const aId = table.insert({ number: 2, string: 'a' })
	const bId = table.insert({ number: 1, string: 'b' })

	const query = table.query({
		select: ['id'],
		sort: (a, b) => {
			if (a.number !== b.number) {
				return a.number - b.number
			} else {
				return a.string.localeCompare(b.string)
			}
		},
	})

	// @ts-expect-error number was not selected
	query.result[0].number

	// @ts-expect-error string was not selected
	query.result[0].string

	assert.deepEqual(query.result, [
		{ id: bId, number: 1, string: 'b' },
		{ id: aId, number: 2, string: 'a' },
	])

	table.update(aId, 'number', 1)

	assert.deepEqual(query.result, [
		{ id: aId, number: 1, string: 'a' },
		{ id: bId, number: 1, string: 'b' },
	])
})

test('preserve row reference on update', () => {
	table.insert({ number: 1, string: 'a' })
	const query = table.query({})
	const row = query.result[0]
	table.update(row.id, 'string', 'b')
	assert.equal(query.result[0], row)
})
