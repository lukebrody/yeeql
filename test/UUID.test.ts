import assert from 'assert/strict'
import { UUID } from 'index'
import test from 'node:test'

test('length', () => {
	for (let i = 0; i < 10000; i++) {
		assert.equal(UUID.create().length, UUID.length)
	}
})

test('encoding/decoding', () => {
	const id = UUID.create()
	const coded = UUID.decode(UUID.encode(id))
	assert.equal(coded, id)
})

test('UUIDs are unique', () => {
	const set = new Set<UUID>()
	const quantity = 10000
	for (let i = 0; i < quantity; i++) {
		set.add(UUID.create())
	}
	assert.equal(set.size, quantity)
})

test('decode error on incorrect length', () => {
	assert.throws(() => UUID.decode(new Uint8Array()))
})
