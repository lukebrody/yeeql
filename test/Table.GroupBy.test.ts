import { UUID, Field, Table, QueryChange } from 'index'
import * as Y from 'yjs'

import { beforeEach, test, expect, vi, Mock } from 'vitest'

const schema = {
	id: new Field<UUID>(),
	number: new Field<number>(),
	string: new Field<string>(),
}

let doc: Y.Doc
let yTable: Y.Map<Y.Map<unknown>>
let table: Table<typeof schema>
let query: ReturnType<typeof table.groupBy>
let spy: Mock<QueryChange<typeof query>[], undefined>

beforeEach(() => {
	doc = new Y.Doc()
	yTable = doc.getMap('table') as Y.Map<Y.Map<unknown>>
	table = new Table(yTable, schema)
	query = table.groupBy({
		groupBy: 'number',
		subquery: (number) => table.count({ filter: { number } }),
	})
	spy = vi.fn()
	query.observe(spy)
})

function popChanges() {
	const result = spy.mock.calls.map((calls) => calls[0])
	spy.mockClear()
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
	expect(query.result.size).toBe(2)
	expect(query.result.get(1)).toBe(1)
	expect(query.result.get(2)).toBe(1)
})

test('nothing update', () => {
	const rowId = table.insert({ number: 1, string: 'a' })
	popChanges()
	table.update(rowId, 'number', 1)
	expect(popChanges()).toStrictEqual([])
	expect(query.result.size).toBe(1)
})

test('iterators', () => {
	table.insert({ number: 1, string: 'a' })
	table.insert({ number: 2, string: 'a' })
	expect(Array.from(query.result)).toStrictEqual([
		[1, 1],
		[2, 1],
	])
	expect(Array.from(query.result.entries())).toStrictEqual([
		[1, 1],
		[2, 1],
	])
	expect(Array.from(query.result.values())).toStrictEqual([1, 1])

	const spy = vi.fn()
	query.result.forEach(spy)
	expect(spy.mock.calls).toStrictEqual([
		[1, 1, query.result],
		[1, 2, query.result],
	])

	expect(query.result.has(1)).toBe(true)
	expect(query.result.has(3)).toBe(false)

	expect(Array.from(query.result.keys())).toStrictEqual([1, 2])
})
