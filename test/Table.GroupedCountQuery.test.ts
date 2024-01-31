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

	table.insert({ number: 1, string: 'b' })

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
	expect(popChanges()).toStrictEqual([
		{
			group: 2,
			kind: 'addGroup',
			result: 1,
			type: 'add',
		},
	])

	table.update(row3, 'number', 2)

	expect(query.result.size).toBe(2)
	expect(query.result.get(1)).toBe(1)
	expect(query.result.get(2)).toBe(2)
	expect(popChanges()).toStrictEqual([
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

	expect(query.result.size).toBe(2)
	expect(query.result.get(1)).toBe(1)
	expect(query.result.get(2)).toBe(1)
	expect(popChanges()).toStrictEqual([
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

	expect(query.result.size).toBe(1)
	expect(query.result.get(1)).toBe(0)
	expect(query.result.get(2)).toBe(2)
	expect(popChanges()).toStrictEqual([
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

	expect(query.result.size).toBe(1)
	expect(query.result.get(1)).toBe(0)
	expect(query.result.get(2)).toBe(1)
	expect(popChanges()).toStrictEqual([
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

	expect(query.result.size).toBe(1)
	expect(query.result.get(1)).toBe(1)
	expect(query.result.get(2)).toBe(0)

	expect(popChanges()).toStrictEqual([
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

	expect(popChanges()).toStrictEqual([
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
