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

	const values = query.result.values()
	values.next()
	assert.deepEqual(Array.from(values), [1])
	const entries = query.result.entries()
	entries.next()
	assert.deepEqual(Array.from(entries), [[2, 1]])
})

test('a throwing observer does not stop the group change', (t) => {
	const reported = t.mock.method(globalThis, 'queueMicrotask', () => undefined)
	const id = table.insert({ number: 1, string: 'a' })
	query.observe((change) => {
		if (change.kind === 'removeGroup') {
			throw new Error('removeGroup')
		}
	})
	spy.mock.resetCalls()

	table.update(id, 'number', 2)
	assert.deepEqual(
		popChanges().map((change) => change.kind),
		['subquery', 'removeGroup', 'addGroup'],
	)
	assert.equal(reported.mock.callCount(), 1)
})

test('a group removed, re-added and removed in one transaction stops observing its subquery', () => {
	const windowed = table.query({
		groupBy: 'string',
		sort: (a, b) => a.number - b.number,
		offset: 1,
	})
	const windowedSpy = mock.fn()
	windowed.observe(windowedSpy)
	const leaving = table.insert({ number: 0, string: 'x' })
	const entering = table.insert({ number: 1, string: 'y' })
	const alsoLeaving = table.insert({ number: 2, string: 'x' })
	doc.transact(() => {
		table.update(leaving, 'string', 'z')
		table.update(entering, 'string', 'x')
		table.update(alsoLeaving, 'string', 'z')
	})
	assert.equal(windowed.result.has('x'), false)

	table.insert({ number: 3, string: 'x' })
	windowedSpy.mock.resetCalls()
	table.insert({ number: 4, string: 'x' })
	assert.equal(windowedSpy.mock.callCount(), 1)
})

const throwingSort = (a: { number: number }, b: { number: number }) => {
	if (a.number === 666 || b.number === 666) {
		throw new Error('sort')
	}
	return a.number - b.number
}

const groupZeroByString = () =>
	table.groupBy({
		groupBy: 'string',
		filter: { number: 0 },
		subquery: (string) =>
			table.query({ filter: { string }, sort: throwingSort }),
	})

test("a grouped query invalidated by a sibling group stops observing a removed group's subquery", (t) => {
	t.mock.method(globalThis, 'queueMicrotask', () => undefined)
	const grouped = groupZeroByString()
	const removed = table.insert({ number: 0, string: 'x' })
	table.insert({ number: 0, string: 'y' })
	doc.transact(() => {
		table.delete(removed)
		table.insert({ number: 666, string: 'y' })
		table.insert({ number: 1, string: 'x' })
	})
	assert.throws(() => grouped.result, /the sort comparator threw/)
})

for (const batched of [true, false]) {
	test(`a removed group's failing subquery leaves the grouped query valid, batched=${batched}`, (t) => {
		t.mock.method(globalThis, 'queueMicrotask', () => undefined)
		const grouped = groupZeroByString()
		const removed = table.insert({ number: 0, string: 'x' })
		table.insert({ number: 0, string: 'y' })
		table.insert({ number: 1, string: 'x' })
		const remove = () => table.delete(removed)
		const fail = () => table.insert({ number: 666, string: 'x' })
		if (batched) {
			doc.transact(() => {
				remove()
				fail()
			})
		} else {
			remove()
			fail()
		}
		assert.deepEqual(Array.from(grouped.result.keys()), ['y'])
	})
}

test("a removed group's subquery is unobserved after the transaction", () => {
	const grouped = table.groupBy({
		groupBy: 'string',
		filter: { number: 0 },
		subquery: (string) => table.count({ filter: { string } }),
	})
	const removed = table.insert({ number: 0, string: 'x' })
	table.delete(removed)
	const version = grouped.version
	table.insert({ number: 1, string: 'x' })
	assert.equal(grouped.version, version)
})
