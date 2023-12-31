import { UUID } from '../common/UUID'
import { QueryRegistryEntry, QueryRegistry, addedOrRemoved, _testQueryEntries } from './QueryRegistry'
import { Field } from './Schema'

import { expect, test } from 'vitest'

const schema = {
	id: new Field<UUID>(),
	number: new Field<number>(),
	string: new Field<string>(),
	boolean: new Field<boolean>()
}

class StubQuery implements QueryRegistryEntry<typeof schema> {
	readonly filter = { number: 1 }
	readonly select = new Set<'string'>(['string'])

	doItemAdd(): number {
		throw new Error('not implemented')
	}

	postItemAdd(): void {
		throw new Error('not implemented')
	}

	doItemRemove(): number {
		throw new Error('not implemented')
	}

	postItemRemove(): void {
		throw new Error('not implemented')
	}

	postItemChange(): void {
		throw new Error('not implemented')
	}
}


test('QueryRegistry.register', () => {
	const qr = new QueryRegistry(schema)

	const stubQuery = new StubQuery()
	qr.register(stubQuery)

	expect(qr.queries({ id: UUID.create(), number: 1, string: '', boolean: false }, addedOrRemoved).size).toBe(1)
	expect(qr.queries({ id: UUID.create(), number: 2, string: '', boolean: false }, addedOrRemoved).size).toBe(0)

	expect(qr.queries({ id: UUID.create(), number: 1, string: '', boolean: false }, { string: '' }).size).toBe(1)
	expect(qr.queries({ id: UUID.create(), number: 1, string: '', boolean: false }, { number: 1 }).size).toBe(1)
	expect(qr.queries({ id: UUID.create(), number: 1, string: '', boolean: false }, { boolean: true }).size).toBe(0)
})

test('QueryRegistry memory management', async () => {
	const qr = new QueryRegistry(schema)

	let stubQuery: StubQuery | undefined = new StubQuery()

	qr.register(stubQuery)

	expect(qr.queries({ id: UUID.create(), number: 1, string: '', boolean: false }, addedOrRemoved).size).toBe(1)

	stubQuery = undefined
	await new Promise(resolve => setTimeout(resolve, 0))
	global.gc!()
	await new Promise(resolve => setTimeout(resolve, 0))

	_testQueryEntries.value = 0

	expect(qr.queries({ id: UUID.create(), number: 1, string: '', boolean: false }, addedOrRemoved).size).toBe(0)

	expect(_testQueryEntries.value).toBe(0)
})