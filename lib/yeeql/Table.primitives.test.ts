import { UUID } from '../common/UUID'
import { Field } from './Schema'
import { Table } from './Table'
import * as Y from 'yjs'

import { beforeEach, test } from 'vitest'

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

test('Table.filterPrimitiveTypeChecking', () => {
	table.query({
		// @ts-expect-error Should not allow non-primitive object as a filter
		filter: { object: {} },
	})
})

test('Table.groupByPrimitiveTypeChecking', () => {
	table.count({
		// @ts-expect-error Should not allow non-primitive object for groupBy
		groupBy: 'object',
	})
})

test('Table.sortPrimitiveTypeChecking', () => {
	table.query({
		sort: (a, b) =>
			// @ts-expect-error Should not allow sorting on non-primitive object
			JSON.stringify(a.object).localeCompare(JSON.stringify(b.object)),
	})
})

test('Table.subquery.sortPrimitives.linear', () => {
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

test('Table.subquery.sortPrimitives.grouped', () => {
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

test('Table.subquery.sortPrimitives.deep', () => {
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

test('Table.subquery.sortPrimitives.count', () => {
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

test('Table.subquery.sortPrimitives.groupedCount', () => {
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
