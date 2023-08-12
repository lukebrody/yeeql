import { UUID } from '../common/UUID'
import { QueryRegistryEntry, QueryRegistry, addedOrRemoved } from './QueryRegistry'
import { Field, Row } from './Schema'

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

	doItemAdd(row: Row<typeof schema>): number {
		throw new Error('not implemented')
	}

	postItemAdd(row: Row<typeof schema>): void {
		throw new Error('not implemented')
	}

	doItemRemove(row: Row<typeof schema>): number {
		throw new Error('not implemented')
	}

	postItemRemove(row: Row<typeof schema>): void {
		throw new Error('not implemented')
	}

	postItemChange(row: Row<typeof schema>, oldValues: Readonly<Partial<Row<{ id: Field<UUID>; number: Field<number>; string: Field<string> }>>>): void {
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

	expect(qr.queries({ id: UUID.create(), number: 1, string: '', boolean: false }, addedOrRemoved).size).toBe(0)
})