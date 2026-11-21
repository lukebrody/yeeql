import { RangeIndex } from 'yeeql/table/RangeIndex'
import { Range, matchesFilter, rangeBounds } from 'yeeql/table/Schema'
import { Field, UUID } from 'index'

import assert from 'assert/strict'
import test from 'node:test'

const schema = { id: new Field<UUID>(), number: new Field<number>() }

function randomBound(): number | undefined {
	return Math.random() < 0.3 ? undefined : Math.floor(Math.random() * 10)
}

function randomRange(): Range<number> {
	const range: Range<number> = {
		[Math.random() < 0.5 ? 'gt' : 'gte']: randomBound(),
		[Math.random() < 0.5 ? 'lt' : 'lte']: randomBound(),
	}
	return rangeBounds(range).length === 0 ? randomRange() : range
}

test('matches brute force', () => {
	const index = new RangeIndex<Range<number>>()
	let ranges: Range<number>[] = []

	for (let step = 0; step < 1000; step++) {
		if (ranges.length > 0 && Math.random() < 0.45) {
			const removed = ranges[Math.floor(Math.random() * ranges.length)]
			ranges = ranges.filter((range) => range !== removed)
			index.delete(removed, removed)
		} else {
			const added = randomRange()
			ranges.push(added)
			index.add(added, added)
		}

		for (let value = -1; value <= 11; value += 0.5) {
			const expected = ranges.filter((range) =>
				matchesFilter<typeof schema>(
					{ number: range },
					{ id: '' as UUID, number: value },
				),
			)
			assert.deepEqual(new Set(index.get(value)), new Set(expected))
		}
		assert.equal(index.isEmpty, ranges.length === 0)
	}
})

test('NaN is in no range', () => {
	const index = new RangeIndex<string>()
	index.add({ lt: 5 }, 'a')
	assert.equal(index.get(NaN).size, 0)
})
