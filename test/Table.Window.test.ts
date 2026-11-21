import { UUID, Field, Table, QueryChange } from 'index'
import * as Y from 'yjs'

import { beforeEach, test } from 'node:test'
import assert from 'assert/strict'
import { LinearQuery } from 'yeeql/query/interface/LinearQuery'
import { TableSchema } from 'yeeql/table/Schema'
import { SubqueryGenerators } from 'yeeql/query/subquery'

const schema = {
	id: new Field<UUID>(),
	number: new Field<number>(),
	string: new Field<string>(),
}

let doc: Y.Doc
let table: Table<typeof schema>

beforeEach(() => {
	doc = new Y.Doc()
	table = new Table(doc.getMap('table') as Y.Map<Y.Map<unknown>>, schema)
})

const byNumber = (a: { number: number }, b: { number: number }) =>
	a.number - b.number

function replay<
	S extends TableSchema,
	Select extends keyof S,
	Q extends SubqueryGenerators<S>,
>(query: LinearQuery<S, Select, Q>) {
	const replayed = [...query.result]
	const changes: QueryChange<typeof query>[] = []
	query.observe((change) => {
		changes.push(change)
		if (change.kind !== 'add') {
			assert.equal(replayed[change.oldIndex], change.row)
			replayed.splice(change.oldIndex, 1)
		}
		if (change.kind !== 'remove') {
			replayed.splice(change.newIndex, 0, change.row)
		}
	})
	return { replayed, changes }
}

test('limit and offset', () => {
	const ids = [5, 1, 4, 2, 3].map((number) =>
		table.insert({ number, string: '' }),
	)
	const query = table.query({
		select: ['number'],
		sort: byNumber,
		offset: 1,
		limit: 2,
	})
	assert.deepEqual(
		query.result.map(({ number }) => number),
		[2, 3],
	)

	const { changes } = replay(query)

	// Shifts the window by inserting before it
	table.insert({ number: 0, string: '' })
	assert.deepEqual(
		query.result.map(({ number }) => number),
		[1, 2],
	)
	assert.deepEqual(
		changes.map(({ kind, type, row }) => ({ kind, type, number: row.number })),
		[
			{ kind: 'remove', type: 'update', number: 3 },
			{ kind: 'add', type: 'update', number: 1 },
		],
	)

	changes.length = 0
	table.delete(ids[3])
	assert.deepEqual(
		changes.map(({ kind, type, row }) => ({ kind, type, number: row.number })),
		[
			{ kind: 'remove', type: 'delete', number: 2 },
			{ kind: 'add', type: 'update', number: 3 },
		],
	)

	changes.length = 0
	table.insert({ number: 1.5, string: '' })
	assert.deepEqual(
		changes.map(({ kind, type, row }) => ({ kind, type, number: row.number })),
		[
			{ kind: 'remove', type: 'update', number: 3 },
			{ kind: 'add', type: 'add', number: 1.5 },
		],
	)

	changes.length = 0
	table.update(ids[1], 'number', 1.75)
	assert.deepEqual(changes, [
		{
			kind: 'update',
			row: query.result[1],
			oldIndex: 0,
			newIndex: 1,
			oldValues: { number: 1 },
			type: 'update',
		},
	])

	// Changes past the window don't notify
	changes.length = 0
	table.update(ids[0], 'number', 6)
	table.update(ids[0], 'string', 'a')
	table.insert({ number: 7, string: '' })
	assert.deepEqual(changes, [])
})

test('window cache', () => {
	const query = table.query({ sort: byNumber, limit: 2 })
	assert.equal(query, table.query({ sort: byNumber, limit: 2 }))
	assert.notEqual(query, table.query({ sort: byNumber, limit: 3 }))
	assert.notEqual(query, table.query({ sort: byNumber, limit: 2, offset: 1 }))
	assert.notEqual(query, table.query({ sort: byNumber }))
	assert.notEqual(query, table.query({ sort: byNumber, offset: 1 }))
})

test('invalid limit and offset', () => {
	assert.throws(
		() => table.query({ limit: -1 }),
		/'limit' must be a non-negative integer/,
	)
	assert.throws(
		() => table.query({ offset: 0.5 }),
		/'offset' must be a non-negative integer/,
	)
	assert.throws(
		() => table.query({ limit: Infinity }),
		/'limit' must be a non-negative integer/,
	)
})

test('grouped window', () => {
	for (const [number, string] of [
		[1, 'a'],
		[2, 'a'],
		[3, 'a'],
		[1, 'b'],
	] as const) {
		table.insert({ number, string })
	}
	const query = table.query({
		select: ['number'],
		groupBy: 'string',
		sort: byNumber,
		offset: 1,
		limit: 1,
	})
	assert.deepEqual(
		query.result.get('a').map(({ number }) => number),
		[2],
	)
	assert.deepEqual(query.result.get('b'), [])
	assert.notEqual(
		query,
		table.query({ select: ['number'], groupBy: 'string', sort: byNumber }),
	)
})

test('window over subqueries', () => {
	const tags = new Table(doc.getMap('tags') as Y.Map<Y.Map<unknown>>, {
		id: new Field<UUID>(),
		string: new Field<string>(),
	})
	const query = table.query({
		subqueries: {
			tagCount: ({ string }) => tags.count({ filter: { string } }),
		},
		sort: (a, b) => b.tagCount - a.tagCount,
		limit: 1,
	})
	const { replayed, changes } = replay(query)

	const aId = table.insert({ number: 0, string: 'a' })
	table.insert({ number: 0, string: 'b' })
	tags.insert({ string: 'b' })
	assert.equal(query.result[0].string, 'b')

	changes.length = 0
	table.update(aId, 'number', 1)
	assert.deepEqual(changes, [])

	tags.insert({ string: 'b' })
	assert.deepEqual(
		changes.map(({ kind }) => kind),
		['subquery'],
	)

	tags.insert({ string: 'a' })
	tags.insert({ string: 'a' })
	tags.insert({ string: 'a' })
	assert.equal(query.result[0].string, 'a')
	assert.deepEqual(replayed, query.result)
})

test('a dropped window stops observing', async () => {
	const full = table.query({ sort: byNumber })
	let window: typeof full | undefined = table.query({
		sort: byNumber,
		limit: 1,
	})
	const weakWindow = new WeakRef(window)
	window = undefined

	await new Promise((resolve) => setTimeout(resolve, 10))
	global.gc!()
	await new Promise((resolve) => setTimeout(resolve, 10))

	assert.equal(weakWindow.deref(), undefined)
	table.insert({ number: 0, string: '' })
	table.insert({ number: 1, string: '' })
	assert.equal(full.result.length, 2)
})

test('random windows', () => {
	const ids: UUID[] = []
	const windows: {
		query: LinearQuery<typeof schema, keyof typeof schema, {}>
		full: LinearQuery<typeof schema, keyof typeof schema, {}>
		offset: number
		limit: number
		replayed: unknown[]
	}[] = []
	for (const offset of [0, 1, 3]) {
		for (const limit of [0, 1, 4]) {
			for (const sort of [
				byNumber,
				(a: { string: string }, b: { string: string }) =>
					a.string.localeCompare(b.string),
			]) {
				const query = table.query({ sort, offset, limit })
				windows.push({
					query,
					full: table.query({ sort }),
					offset,
					limit,
					replayed: replay(query).replayed,
				})
			}
		}
	}

	const randomInt = (max: number) => Math.floor(Math.random() * max)
	const randomId = () => ids[randomInt(ids.length)]

	for (let i = 0; i < 500; i++) {
		doc.transact(() => {
			for (let j = 0; j < 1 + randomInt(3); j++) {
				const action = randomInt(4)
				if (action === 0 || ids.length === 0) {
					ids.push(
						table.insert({ number: randomInt(10), string: `${randomInt(10)}` }),
					)
				} else if (action === 1) {
					const id = randomId()
					table.delete(id)
					ids.splice(ids.indexOf(id), 1)
				} else if (action === 2) {
					table.update(randomId(), 'number', randomInt(10))
				} else {
					table.update(randomId(), 'string', `${randomInt(10)}`)
				}
			}
		})
		for (const { query, full, offset, limit, replayed } of windows) {
			assert.deepEqual(query.result, full.result.slice(offset, offset + limit))
			assert.deepEqual(replayed, query.result)
		}
	}
})
