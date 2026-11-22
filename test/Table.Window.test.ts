import { UUID, Field, Table, QueryChange } from 'index'
import * as Y from 'yjs'

import { beforeEach, test } from 'node:test'
import assert from 'assert/strict'
import { Change, LinearQuery } from 'yeeql/query/interface/LinearQuery'
import { TableSchema } from 'yeeql/table/Schema'
import { SubqueryGenerators } from 'yeeql/query/subquery'
import { seededRandom } from 'test/random'
import { replay as replayWithSubqueries } from 'test/replay'

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
	const changes: Change<S, Select, Q>[] = []
	query.observe((change) => {
		assert(change.kind !== 'invalid')
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
	assert.equal(
		table.query({ sort: byNumber, offset: 0 }),
		table.query({ sort: byNumber }),
	)
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
	assert.deepEqual([...query.result.keys()], ['a'])
	assert.notEqual(
		query,
		table.query({ select: ['number'], groupBy: 'string', sort: byNumber }),
	)
})

test('a group shows once its window has a row', () => {
	const query = table.query({
		groupBy: 'string',
		sort: byNumber,
		offset: 1,
	})
	const changes: QueryChange<typeof query>[] = []
	query.observe((change) => changes.push(change))

	const firstId = table.insert({ number: 1, string: 'a' })
	assert.equal(query.result.has('a'), false)
	assert.deepEqual(changes, [])

	table.insert({ number: 2, string: 'a' })
	assert.deepEqual(
		changes.map(({ kind, group }) => ({ kind, group })),
		[{ kind: 'addGroup', group: 'a' }],
	)
	assert.deepEqual(
		query.result.get('a').map(({ number }) => number),
		[2],
	)

	changes.length = 0
	table.update(firstId, 'string', 'b')
	assert.deepEqual(
		changes.map(({ kind, group }) => ({ kind, group })),
		[
			{ kind: 'subquery', group: 'a' },
			{ kind: 'removeGroup', group: 'a' },
		],
	)
	assert.equal(query.result.size, 0)

	const empty = table.query({ groupBy: 'string', sort: byNumber, limit: 0 })
	assert.equal(empty.result.size, 0)
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

test('subqueries only for rows in the window', () => {
	const tags = new Table(doc.getMap('tags') as Y.Map<Y.Map<unknown>>, {
		id: new Field<UUID>(),
		string: new Field<string>(),
	})
	const subqueryRows: number[] = []
	const query = table.query({
		select: ['number', 'string'],
		subqueries: {
			tagCount: (row) => {
				const { string } = row
				if (typeof row.number === 'number') {
					subqueryRows.push(row.number)
				}
				return tags.count({ filter: { string } })
			},
		},
		sort: byNumber,
		limit: 2,
	})
	const { replayed, changes } = replay(query)

	const ids = [0, 1, 2, 3].map((number) =>
		table.insert({ number, string: `${number}` }),
	)
	assert.deepEqual(subqueryRows, [0, 1])
	assert.deepEqual(
		query.result.map(({ number, tagCount }) => ({ number, tagCount })),
		[
			{ number: 0, tagCount: 0 },
			{ number: 1, tagCount: 0 },
		],
	)

	changes.length = 0
	tags.insert({ string: '1' })
	tags.insert({ string: '3' })
	assert.deepEqual(changes, [
		{
			kind: 'subquery',
			row: query.result[1],
			oldIndex: 1,
			newIndex: 1,
			key: 'tagCount',
			change: { delta: 1, type: 'add' },
			type: 'update',
		},
	])

	changes.length = 0
	table.update(ids[1], 'string', '3')
	assert.deepEqual(changes, [
		{
			kind: 'update',
			row: query.result[1],
			oldIndex: 1,
			newIndex: 1,
			oldValues: { string: '1', tagCount: 1 },
			type: 'update',
		},
	])

	changes.length = 0
	table.delete(ids[0])
	assert.deepEqual(
		changes.map(({ kind, type, row }) => ({ kind, type, number: row.number })),
		[
			{ kind: 'remove', type: 'delete', number: 0 },
			{ kind: 'add', type: 'update', number: 2 },
		],
	)

	table.update(ids[3], 'number', -1)
	assert.deepEqual(
		query.result.map(({ number, tagCount }) => ({ number, tagCount })),
		[
			{ number: -1, tagCount: 1 },
			{ number: 1, tagCount: 1 },
		],
	)
	assert.deepEqual(replayed, query.result)
})

function assertMissedSubquery(query: { readonly result: unknown }) {
	assert.throws(
		() => query.result,
		(error: Error) => {
			assert.match(
				String(error.cause),
				/sort comparator read column 'sameString'/,
			)
			return true
		},
	)
}

test('a sort that skips reading a subquery during the probe throws', () => {
	table.insert({ number: 0, string: '' })
	table.insert({ number: 1, string: '' })
	assert.throws(
		() =>
			table.query({
				subqueries: {
					sameString: ({ string }) => table.count({ filter: { string } }),
				},
				sort: (a, b) =>
					a.number === b.number ? 0 : a.sameString - b.sameString,
				limit: 1,
			}),
		(error: Error) => {
			assert.match(
				String(error.cause),
				/sort comparator read column 'sameString'/,
			)
			return true
		},
	)
})

test('a subquery the sort missed is caught even when an unwatched full query is cached', (t) => {
	t.mock.method(globalThis, 'queueMicrotask', () => undefined)
	table.insert({ number: 0, string: '' })
	table.insert({ number: 1, string: '' })
	const subqueries = {
		sameString: ({ string }: { string: string }) =>
			table.count({ filter: { string } }),
	}
	type SortRow = {
		id: UUID
		number: number
		string: string
		sameString: number
	}
	const sort = (a: SortRow, b: SortRow) =>
		a.number > 100 && b.number > 100
			? (a.sameString ?? 0) - (b.sameString ?? 0)
			: a.number - b.number
	// Same `sort` without a `select`, so its full query is unguarded
	const unwatched = table.query({ sort: sort as unknown as typeof byNumber })
	const query = table.query({
		subqueries,
		sort,
		limit: 3,
	})
	table.insert({ number: 101, string: '' })
	table.insert({ number: 102, string: '' })
	assertMissedSubquery(query)
	assert.equal(unwatched.result.length, 4)
})

test('a sort that reads a missed subquery invalidates the window', (t) => {
	t.mock.method(globalThis, 'queueMicrotask', () => undefined)
	table.insert({ number: 101, string: '' })
	const query = table.query({
		subqueries: {
			sameString: ({ string }) => table.count({ filter: { string } }),
		},
		sort: (a, b) =>
			a.number > 100 && b.number > 100
				? a.sameString.valueOf() - b.sameString.valueOf()
				: a.number - b.number,
		limit: 2,
	})
	table.insert({ number: 102, string: '' })
	assertMissedSubquery(query)
})

test('a dropped window stops observing', async () => {
	const full = table.query({ sort: byNumber })
	let window: typeof full | undefined = table.query({
		sort: byNumber,
		limit: 1,
	})
	const weakWindow = new WeakRef(window)
	window = undefined
	let subqueryWindow: object | undefined = table.query({
		subqueries: {
			sameString: ({ string }) => table.count({ filter: { string } }),
		},
		sort: byNumber,
		limit: 1,
	})
	const weakSubqueryWindow = new WeakRef(subqueryWindow)
	subqueryWindow = undefined

	await new Promise((resolve) => setTimeout(resolve, 10))
	global.gc!()
	await new Promise((resolve) => setTimeout(resolve, 10))

	assert.equal(weakWindow.deref(), undefined)
	assert.equal(weakSubqueryWindow.deref(), undefined)
	table.insert({ number: 0, string: '' })
	table.insert({ number: 1, string: '' })
	assert.equal(full.result.length, 2)
})

test('an invalid query skips a dropped window', async (t) => {
	t.mock.method(globalThis, 'queueMicrotask', () => undefined)
	const subqueries = {
		sameString: ({ string }: { string: string }) => {
			if (string === 'boom') {
				throw new Error('boom')
			}
			return table.count({ filter: { string } })
		},
	}
	const sort = (a: { sameString: number }, b: { sameString: number }) =>
		a.sameString - b.sameString
	table.insert({ number: 0, string: '' })
	// The sort reads a subquery, so the window is over a query with subqueries
	const full = table.query({ subqueries, sort })
	let window: object | undefined = table.query({ subqueries, sort, limit: 1 })
	const weakWindow = new WeakRef(window)
	window = undefined

	await new Promise((resolve) => setTimeout(resolve, 10))
	global.gc!()
	await new Promise((resolve) => setTimeout(resolve, 10))

	assert.equal(weakWindow.deref(), undefined)
	table.insert({ number: 1, string: 'boom' })
	assert.throws(() => full.result, /subquery 'sameString' threw/)
})

test('random windows', () => {
	const ids: UUID[] = []
	const windows: {
		query: { result: readonly unknown[] }
		full: { result: readonly unknown[] }
		offset: number
		limit: number | undefined
		replayed: unknown[]
	}[] = []
	for (const offset of [0, 1, 3]) {
		// Without `limit`, offset 0 is the full query, not a window
		for (const limit of offset === 0 ? [0, 1, 4] : [0, 1, 4, undefined]) {
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
				const subqueries = {
					sameNumber: ({ number }: { number: number }) =>
						table.count({ filter: { number } }),
				}
				const subqueryWindow = table.query({ subqueries, sort, offset, limit })
				windows.push({
					query: subqueryWindow,
					full: table.query({ subqueries, sort }),
					offset,
					limit,
					replayed: replay(subqueryWindow).replayed,
				})
			}
		}
	}

	const randomInt = seededRandom(1).int
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
			assert.deepEqual(
				query.result,
				full.result.slice(
					offset,
					limit === undefined ? undefined : offset + limit,
				),
			)
			assert.deepEqual(replayed, query.result)
		}
	}
})

test('a throwing observer does not stop later changes to the window', (t) => {
	const reported = t.mock.method(globalThis, 'queueMicrotask', () => undefined)
	table.insert({ number: 2, string: '' })
	const query = table.query({ select: ['number'], sort: byNumber, limit: 1 })
	query.observe((change) => {
		if (change.kind === 'remove') {
			throw new Error('remove')
		}
	})
	const { replayed } = replay(query)

	table.insert({ number: 1, string: '' })
	assert.deepEqual(
		replayed.map(({ number }) => number),
		[1],
	)
	assert.equal(reported.mock.callCount(), 1)
})

test('a row that entered the window this transaction reports a later subquery move as an update', () => {
	const leaving = table.insert({ number: 1, string: 'a' })
	table.insert({ number: 2, string: 'b' })
	table.insert({ number: 0, string: 'c' })
	const sibling = table.insert({ number: 100, string: 'c' })
	const query = table.query({
		select: ['number', 'string'],
		subqueries: {
			sameString: (row) => table.count({ filter: { string: row.string } }),
		},
		sort: (a, b) => a.sameString - b.sameString || byNumber(a, b),
		limit: 2,
	})
	const { changes } = replay(query)
	const checkReplayed = replayWithSubqueries(query, schema)

	// 'c' enters the window, then its count drops and it moves ahead of 'b'
	doc.transact(() => {
		table.delete(leaving)
		table.delete(sibling)
	})
	assert.deepEqual(
		changes.map(({ kind, row }) => [kind, row.string]),
		[
			['remove', 'a'],
			['add', 'c'],
			['update', 'c'],
		],
	)
	assert.deepEqual(changes[2], {
		kind: 'update',
		row: query.result[0],
		oldIndex: 1,
		newIndex: 0,
		oldValues: {},
		type: 'update',
	})
	checkReplayed()
})
