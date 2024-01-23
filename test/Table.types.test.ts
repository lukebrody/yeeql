import { UUID, Field, Table } from 'index'
import * as Y from 'yjs'

import { beforeEach, test, expect } from 'vitest'

const schema = {
	id: new Field<UUID>(),
	number: new Field<number>(),
	string: new Field<string>(),
	object: new Field<object>(),
}

let doc: Y.Doc
let yTable: Y.Map<Y.Map<unknown>>
let table: Table<typeof schema>

beforeEach(() => {
	doc = new Y.Doc()
	yTable = doc.getMap('table') as Y.Map<Y.Map<unknown>>
	table = new Table(yTable, schema)
})

test('select type checking', () => {
	expect(
		() =>
			table.query({
				// @ts-expect-error Can't select unknown column id2
				select: ['id2'],
			}),
		// eslint-disable-next-line quotes
	).toThrow("unknown column 'id2'")
})

test('filter type checking', () => {
	expect(
		() =>
			table.query({
				select: ['id'],
				// @ts-expect-error Can't filter by unknown column number2
				filter: { number2: 1 },
			}),
		// eslint-disable-next-line quotes
	).toThrow("unknown column 'number2'")
})

test('groupBy count type checking', () => {
	expect(
		() =>
			table.count({
				// @ts-expect-error Can't group by uknown column string2
				groupBy: 'string2',
			}),
		// eslint-disable-next-line quotes
	).toThrow("unknown column 'string2'")
})

test('sort type checking', () => {
	expect(
		() =>
			table.query({
				select: [],
				// @ts-expect-error Can't sort by unknown column string2
				sort: (a, b) => a.string2.localeCompare(b.string2),
			}),
		// eslint-disable-next-line quotes
	).toThrow("unknown column 'string2' used in 'sort' comparator")
})

test('filter primitive type checking', () => {
	table.query({
		// @ts-expect-error Should not allow non-primitive object as a filter
		filter: { object: {} },
	})
})

test('groupBy primitive type checking', () => {
	table.count({
		// @ts-expect-error Should not allow non-primitive object for groupBy
		groupBy: 'object',
	})
})

test('sort primitive type checking', () => {
	table.query({
		sort: (a, b) =>
			// @ts-expect-error Should not allow sorting on non-primitive object
			JSON.stringify(a.object).localeCompare(JSON.stringify(b.object)),
	})
})

test('linear subquery sort primitives', () => {
	table.query({
		subqueries: {
			table: () => table.query({}),
		},
		sort: (a, b) => {
			a.table[0].id
			a.table[0].number
			// @ts-expect-error Should not allow sorting on non-primitive object in subquery
			a.table[0].object.toString() // object is never
			// @ts-expect-error Should not allow sorting on non-primitive object in subquery
			b.table[0].object.toString() // object is never
			return 0
		},
	})
})

test('grouped subquery sort primitives', () => {
	table.query({
		subqueries: {
			table: () => table.query({ groupBy: 'number' }),
		},
		sort: (a) => {
			a.table.get(0)[0].string
			// @ts-expect-error Should not allow sorting on non-primitive object in subquery
			a.table.get(0)[0].object
			return 0
		},
	})
})

test('subquery sort primitives deep', () => {
	table.query({
		subqueries: {
			table1: () =>
				table.query({
					subqueries: {
						table2: () => table.query({}),
					},
				}),
		},
		sort: (a) => {
			a.table1[0].table2[0].string
			// @ts-expect-error Should not allow sorting on non-primitive object in subquery
			a.table1[0].table2[0].object.toString()
			return 0
		},
	})
})

test('subquery sort primitives count', () => {
	table.query({
		subqueries: {
			count: () => table.count({}),
		},
		sort: (a) => {
			a.count
			return 0
		},
	})
})

test('subquery sort primitives grouped count', () => {
	table.query({
		subqueries: {
			count: () => table.count({ groupBy: 'number' }),
		},
		sort: (a) => {
			a.count.get(0) + 1
			return 0
		},
	})
})
