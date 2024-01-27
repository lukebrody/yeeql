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
let query: ReturnType<typeof table.count>
let spy: Mock<QueryChange<typeof query>[], undefined>

beforeEach(() => {
	doc = new Y.Doc()
	yTable = doc.getMap('table') as Y.Map<Y.Map<unknown>>
	table = new Table(yTable, schema)
	query = table.count({ groupBy: 'number', filter: { string: 'a' } })
	spy = vi.fn()
	query.observe(spy)
})

function popChanges() {
	const result = spy.mock.calls.map((calls) => calls[0])
	spy.mockClear()
	return result
}

test('grouped count query result', () => {
	const query = table.count({ groupBy: 'number', filter: { string: 'a' } })

	const row1 = table.insert({ number: 1, string: 'b' })

	expect(query.result.size).toBe(0)
	expect(popChanges()).toStrictEqual([])

	const row2 = table.insert({ number: 1, string: 'a' })

	expect(query.result.size).toBe(1)
	expect(query.result.get(1)).toBe(1)
	expect(popChanges()).toStrictEqual([
		{
			group: 1,
			kind: 'addGroup',
			result: 1,
			type: 'add',
		},
	])

	const row3 = table.insert({ number: 1, string: 'a' })

	expect(query.result.size).toBe(1)
	expect(query.result.get(1)).toBe(2)
	expect(popChanges()).toStrictEqual([
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

	expect(query.result.size).toBe(2)
	expect(query.result.get(1)).toBe(2)
	expect(query.result.get(2)).toBe(1)
	// expect(popChanges()).toStrictEqual([
	// 	{
	// 		group: 2,
	// 		kind: 'addGroup',
	// 		result: 1,
	// 		type: 'add',
	// 	},
	// ])

	table.update(row3, 'number', 2)

	expect(query.result.size).toBe(2)
	expect(query.result.get(1)).toBe(1)
	expect(query.result.get(2)).toBe(2)

	table.update(row3, 'string', 'b')

	expect(query.result.size).toBe(2)
	expect(query.result.get(1)).toBe(1)
	expect(query.result.get(2)).toBe(1)

	table.update(row2, 'number', 2)

	expect(query.result.size).toBe(1)
	expect(query.result.get(1)).toBe(0)
	expect(query.result.get(2)).toBe(2)

	table.delete(row2)

	expect(query.result.size).toBe(1)
	expect(query.result.get(1)).toBe(0)
	expect(query.result.get(2)).toBe(1)

	table.update(row4, 'number', 1)

	expect(query.result.size).toBe(1)
	expect(query.result.get(1)).toBe(1)
	expect(query.result.get(2)).toBe(0)
})

test.skip('grouped count query changes', () => {
	const query = table.count({ groupBy: 'number', filter: { string: 'a' } })
	const spy = vi.fn()
	query.observe(spy)

	const row1 = table.insert({ number: 1, string: 'b' })

	expect(spy).not.toBeCalled()

	const row2 = table.insert({ number: 1, string: 'a' })

	expect(spy).toHaveBeenCalledOnce()
	expect(spy).toHaveBeenLastCalledWith({
		group: 1,
		kind: 'addGroup',
		result: 1,
		type: 'add',
	})
	spy.mockClear()

	const row3 = table.insert({ number: 1, string: 'a' })

	expect(spy).toHaveBeenCalledOnce()
	expect(spy).toHaveBeenLastCalledWith({
		change: 1,
		group: 1,
		kind: 'subquery',
		result: 2,
		type: 'update',
	})
	spy.mockClear()

	const row4 = table.insert({ number: 2, string: 'a' })

	expect(spy).toHaveBeenCalledOnce()
	expect(spy).toHaveBeenLastCalledWith({
		group: 2,
		kind: 'addGroup',
		result: 1,
		type: 'add',
	})
	spy.mockClear()

	table.update(row3, 'number', 2)

	expect(spy).toHaveBeenCalledTimes(2)
	expect(spy).toHaveBeenNthCalledWith(1, {
		change: -1,
		group: 1,
		kind: 'subquery',
		result: 1,
		type: 'update',
	})
	expect(spy).toHaveBeenNthCalledWith(2, {
		change: 1,
		group: 2,
		kind: 'subquery',
		result: 2,
		type: 'update',
	})
	spy.mockClear()

	table.update(row3, 'string', 'b')

	expect(spy).toHaveBeenCalledOnce()
	expect(spy).toHaveBeenLastCalledWith({
		change: -1,
		group: 2,
		kind: 'subquery',
		result: 1,
		type: 'update',
	})
	spy.mockClear()

	table.update(row2, 'number', 2)

	expect(spy).toHaveBeenCalledTimes(3)
	expect(spy).toHaveBeenNthCalledWith(1, {
		change: -1,
		group: 1,
		kind: 'subquery',
		result: 0,
		type: 'update',
	})
	expect(spy).toHaveBeenNthCalledWith(2, {
		group: 1,
		kind: 'removeGroup',
		result: 0,
		type: 'update',
	})
	expect(spy).toHaveBeenNthCalledWith(3, {
		change: 1,
		group: 2,
		kind: 'subquery',
		result: 2,
		type: 'update',
	})
	spy.mockClear()

	table.delete(row2)

	expect(spy).toHaveBeenCalledOnce()
	expect(spy).toHaveBeenLastCalledWith({
		change: -1,
		group: 2,
		kind: 'subquery',
		result: 1,
		type: 'delete',
	})
	spy.mockClear()

	table.update(row4, 'number', 1)

	expect(spy).toHaveBeenCalledTimes(4)
	expect(spy).toHaveBeenNthCalledWith(1, {
		change: -1,
		group: 1,
		kind: 'subquery',
		result: 0,
		type: 'update',
	})
	expect(spy).toHaveBeenNthCalledWith(2, {
		group: 1,
		kind: 'removeGroup',
		result: 0,
		type: 'update',
	})
	expect(spy).toHaveBeenNthCalledWith(3, {
		change: 1,
		group: 2,
		kind: 'subquery',
		result: 2,
		type: 'update',
	})
	expect(spy).toHaveBeenNthCalledWith(4, {
		change: 1,
		group: 2,
		kind: 'subquery',
		result: 2,
		type: 'update',
	})
	spy.mockClear()
})

test('grouped count delete change', () => {
	const query = table.count({ groupBy: 'number', filter: { string: 'a' } })
	const spy = vi.fn()

	const row1 = table.insert({ number: 1, string: 'a' })

	query.observe(spy)

	table.delete(row1)

	expect(spy).toHaveBeenCalledOnce()
	expect(spy).toHaveBeenLastCalledWith({
		group: 1,
		kind: 'removeGroup',
		result: 1,
		type: 'delete',
	})
})
