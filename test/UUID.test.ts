import { expect, test } from 'vitest'
import { UUID } from 'index'

test('length', () => {
	for (let i = 0; i < 10000; i++) {
		expect(UUID.create().length).toBe(UUID.length)
	}
})

test('encoding/decoding', () => {
	const id = UUID.create()
	const coded = UUID.decode(UUID.encode(id))
	expect(coded).toBe(id)
})

test('UUIDs are unique', () => {
	const set = new Set<UUID>()
	const quantity = 10000
	for (let i = 0; i < quantity; i++) {
		set.add(UUID.create())
	}
	expect(set.size).toBe(quantity)
})
