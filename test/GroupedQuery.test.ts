// eslint-disable-next-line no-restricted-imports
import { Field, Table, UUID } from '../lib/index'
import * as Y from 'yjs'

import { beforeEach, expect, test } from 'vitest'

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
	;[
		{ number: 1, string: 'a' },
		{ number: 2, string: 'b' },
	].forEach((row) => table.insert(row))
})

test('simple grouped query', () => {
	const query = table.query({ groupBy: 'number' })
	expect(query.result.get(1)[0].string).toBe('a')
})
