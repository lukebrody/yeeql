import { UUID, Field, Table, QueryChange } from 'index'
import * as Y from 'yjs'

import { beforeEach, test, mock } from 'node:test'
import assert from 'assert/strict'

const schema = {
	id: new Field<UUID>(),
	number: new Field<number>(),
	string: new Field<string>(),
}

let doc: Y.Doc
let yTable1: Y.Map<Y.Map<unknown>>
let table1: Table<typeof schema>
let yTable2: Y.Map<Y.Map<unknown>>
let table2: Table<typeof schema>

beforeEach(() => {
	doc = new Y.Doc()
	yTable1 = doc.getMap('table1') as Y.Map<Y.Map<unknown>>
	table1 = new Table(yTable1, schema)
	yTable2 = doc.getMap('table2') as Y.Map<Y.Map<unknown>>
	table2 = new Table(yTable2, schema)
})

/*
 Expect that Y.js will condense changes made inside one transaction.
*/
test('transaction changes', () => {
	const q1 = table1.query({})
	const q2 = table2.query({})

	const changes1: QueryChange<typeof q1>[] = []
	const changes2: QueryChange<typeof q2>[] = []

	q1.observe((change) => changes1.push(change))
	q2.observe((change) => changes2.push(change))

	doc.transact(() => {
		table1.insert({ number: 1, string: 'a' })
		const bId = table2.insert({ number: 2, string: 'b' })
		table1.insert({ number: 3, string: 'c' })
		table2.update(bId, 'string', 'b2')
		assert.equal(changes1.length, 0)
		assert.equal(changes2.length, 0)
	})

	assert.equal(changes1.length, 2)
	assert.equal(changes2.length, 1)

	assert.equal(changes2[0].kind, 'add')
	assert.equal(changes2[0].row.string, 'b2')
})

/*
 Expect that the programmer gets a consistent view of all tables in the document when the observer is called.
 All observer handlers should see all tables as post-transaction.
*/
test('transaction consistency', () => {
	const q1 = table1.query({})
	const q2 = table2.query({})

	const negativeOneId = table1.insert({ number: -1, string: '!' })
	const zeroId = table1.insert({ number: 0, string: 'zero' })

	const observer1 = mock.fn(() => {
		assert.equal(table1.count({}).result, 2)
		assert.equal(table1.query({ filter: { id: zeroId } }).result[0].string, '0')
		assert.equal(table2.count({}).result, 1)
	})
	q1.observe(observer1)

	const observer2 = mock.fn(() => {
		assert.equal(table1.count({}).result, 2)
		assert.equal(table1.query({ filter: { id: zeroId } }).result[0].string, '0')
		assert.equal(table2.count({}).result, 1)
	})
	q2.observe(observer2)

	doc.transact(() => {
		table1.insert({ number: 1, string: 'a' })
		const bId = table2.insert({ number: 2, string: 'b' })
		table2.update(bId, 'string', 'b2')
		table1.update(zeroId, 'string', '0')
		table1.delete(negativeOneId)
	})

	// Once when inserting 1, again when updating 0, again when removing -1
	assert.equal(observer1.mock.callCount(), 3)

	// Once when inserting 2 (update is combined)
	assert.equal(observer2.mock.callCount(), 1)
})

/*
 Expect that tables can handle multiple insertions in a transaction correctly
*/
test('transaction many inserts', () => {
	const q1 = table1.query({ sort: (a, b) => a.number - b.number })
	const changes1: QueryChange<typeof q1>[] = []
	q1.observe((change) => changes1.push(change))

	doc.transact(() => {
		table1.insert({ number: 1, string: 'a' })
		table1.insert({ number: 2, string: 'b' })
	})

	assert.equal(changes1.length, 2)
	if (changes1[0].kind === 'add') {
		assert.equal(changes1[0]['newIndex'], 0)
	} else {
		assert.fail()
	}
	if (changes1[1].kind === 'add') {
		assert.equal(changes1[1]['newIndex'], 1)
	} else {
		assert.fail()
	}
})

test('transaction many updates', () => {
	const query = table1.query({
		select: ['number'],
		sort: (a, b) => a.number - b.number,
		filter: {
			string: 'a',
		},
		groupBy: 'string',
	})

	const itemA = table1.insert({ number: 1, string: 'a' })
	const itemB = table1.insert({ number: 2, string: 'a' })

	doc.transact(() => {
		table1.update(itemA, 'number', 3)
		table1.update(itemB, 'number', 4)
	})

	assert.deepEqual(query.result.get('a'), [
		{ id: itemA, string: 'a', number: 3 },
		{ id: itemB, string: 'a', number: 4 },
	])
})
