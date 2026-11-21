import { RangeIndex } from 'yeeql/table/RangeIndex'
import { Range, matchesFilter } from 'yeeql/table/Schema'
import { Field, UUID } from 'index'

import assert from 'assert/strict'
import test from 'node:test'
import { seededRandom } from 'test/random'

const schema = { id: new Field<UUID>(), number: new Field<number>() }

const { random, int } = seededRandom(1)

function randomRange(): Range<number> {
	const bound = () => int(10)
	switch (int(8)) {
		case 0:
			return { gt: bound() }
		case 1:
			return { gte: bound() }
		case 2:
			return { lt: bound() }
		case 3:
			return { lte: bound() }
		case 4:
			return { gt: bound(), lt: bound() }
		case 5:
			return { gt: bound(), lte: bound() }
		case 6:
			return { gte: bound(), lt: bound() }
		default:
			return { gte: bound(), lte: bound() }
	}
}

test('matches brute force', () => {
	const index = new RangeIndex<Range<number>>()
	let ranges: Range<number>[] = []

	for (let step = 0; step < 1000; step++) {
		if (ranges.length > 0 && random() < 0.45) {
			const removed = ranges[int(ranges.length)]
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

test('ranges with NaN bounds contain nothing', () => {
	const index = new RangeIndex<string>()
	index.add({ gt: NaN }, 'a')
	index.add({ gt: 1, lt: NaN }, 'b')
	assert.equal(index.get(2).size, 0)
	assert.equal(index.isEmpty, true)
	index.delete({ gt: NaN }, 'a')
	index.delete({ gt: 1, lt: NaN }, 'b')
	assert.equal(index.isEmpty, true)
})

test('bigint ranges', () => {
	const index = new RangeIndex<string>()
	index.add({ gt: 1n, lte: 5n }, 'a')
	assert.equal(index.get(1n).size, 0)
	assert.equal(index.get(3n).size, 1)
	assert.equal(index.get(5n).size, 1)
})
