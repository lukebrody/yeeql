import { UUID } from '../common/UUID'
import { Field } from './Schema'
import { Table } from './Table'
import * as Y from 'yjs'

import { beforeEach, test } from 'vitest'

const schema = {
	id: new Field<UUID>(),
	number: new Field<number>(),
	string: new Field<string>(),
	object: new Field<object>()
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
		filter: { object: {} }
	})
})

test('Table.groupByPrimitiveTypeChecking', () => {
	table.count({
		// @ts-expect-error Should not allow non-primitive object for groupBy
		groupBy: 'object'
	})
})

test('Table.sortPrimitiveTypeChecking', () => {
	table.query({
		// @ts-expect-error Should not allow sorting on non-primitive object
		sort: (a, b) => JSON.stringify(a.object).localeCompare(JSON.stringify(b.object))
	})
})