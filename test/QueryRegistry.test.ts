import { UUID, Field } from 'index'
import {
	QueryRegistryEntry,
	QueryRegistry,
	addedOrRemoved,
	_testQueryEntries,
} from 'yeeql/table/QueryRegistry'

import assert from 'assert/strict'
import test from 'node:test'

const schema = {
	id: new Field<UUID>(),
	number: new Field<number>(),
	string: new Field<string>(),
	boolean: new Field<boolean>(),
}

class StubQuery implements QueryRegistryEntry<typeof schema> {
	readonly filter = { number: 1 }
	readonly select = new Set<'string'>(['string'])

	addRow(): () => void {
		throw new Error('not implemented')
	}

	removeRow(): () => void {
		throw new Error('not implemented')
	}

	changeRow(): () => void {
		throw new Error('not implemented')
	}
}

test('register query', () => {
	const qr = new QueryRegistry(schema)

	const stubQuery = new StubQuery()
	qr.register(stubQuery)

	assert.equal(
		qr.queries(
			{ id: UUID.create(), number: 1, string: '', boolean: false },
			addedOrRemoved,
		).size,
		1,
	)
	assert.equal(
		qr.queries(
			{ id: UUID.create(), number: 2, string: '', boolean: false },
			addedOrRemoved,
		).size,
		0,
	)

	assert.equal(
		qr.queries(
			{ id: UUID.create(), number: 1, string: '', boolean: false },
			{ string: '' },
		).size,
		1,
	)
	assert.equal(
		qr.queries(
			{ id: UUID.create(), number: 1, string: '', boolean: false },
			{ number: 1 },
		).size,
		1,
	)
	assert.equal(
		qr.queries(
			{ id: UUID.create(), number: 1, string: '', boolean: false },
			{ boolean: true },
		).size,
		0,
	)
})

test('memory management', async () => {
	const qr = new QueryRegistry(schema)

	let releasedQuery: StubQuery | undefined = new StubQuery()
	const retainedQuery = new StubQuery()

	qr.register(releasedQuery)
	qr.register(retainedQuery)

	assert.equal(
		qr.queries(
			{ id: UUID.create(), number: 1, string: '', boolean: false },
			addedOrRemoved,
		).size,
		2,
	)

	releasedQuery = undefined
	await new Promise((resolve) => setTimeout(resolve, 10))
	global.gc!()
	await new Promise((resolve) => setTimeout(resolve, 10))

	_testQueryEntries.value = 0

	assert.equal(
		qr.queries(
			{ id: UUID.create(), number: 1, string: '', boolean: false },
			addedOrRemoved,
		).size,
		1,
	)

	assert.equal(_testQueryEntries.value, 1)
})
