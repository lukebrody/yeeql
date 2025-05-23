import { UUID, Field, Table } from 'index'
import * as Y from 'yjs'

import { beforeEach, test } from 'node:test'
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
