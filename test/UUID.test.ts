import { expect, test } from 'vitest'
// eslint-disable-next-line no-restricted-imports
import { UUID } from '../lib/index'

test('UUID length', () => {
	console.log(UUID.create())
	for (let i = 0; i < 10000; i++) {
		expect(UUID.create().length).toBe(UUID.length)
	}
})

test('UUID encoding/decoding', () => {
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
