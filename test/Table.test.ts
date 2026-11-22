import { UUID, Field, Table, QueryChange } from 'index'
import * as Y from 'yjs'

import { beforeEach, test, TestContext } from 'node:test'
import assert from 'assert/strict'
import { _testQueryEntries } from 'yeeql/table/QueryRegistry'

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
})

test('insert', () => {
	const aId = table.insert({ number: 1, string: 'a' })

	const queryAll = table.query({
		select: ['id', 'number', 'string'],
		sort: (a, b) => a.number - b.number,
	})

	assert.deepEqual(queryAll.result, [{ id: aId, number: 1, string: 'a' }])

	const bId = table.insert({ number: 2, string: 'b' })

	assert.deepEqual(queryAll.result, [
		{ id: aId, number: 1, string: 'a' },
		{ id: bId, number: 2, string: 'b' },
	])

	table.update(aId, 'number', 3)

	assert.deepEqual(queryAll.result, [
		{ id: bId, number: 2, string: 'b' },
		{ id: aId, number: 3, string: 'a' },
	])
})

// TODO: Improve/add another this test to check additional cache layers
test('cached queries', () => {
	const queryA = table.query({
		select: ['id'],
		filter: { number: 3 },
	})

	const queryB = table.query({
		select: ['id'],
		filter: { number: 3 },
	})

	assert.equal(queryA, queryB)

	const sort = (a: { number: number }, b: { number: number }) =>
		a.number - b.number

	const queryC = table.query({
		select: ['id', 'string', 'number'],
		filter: { number: 3 },
		sort,
		groupBy: 'string',
	})

	const queryD = table.query({
		select: ['string', 'id'],
		filter: { number: 3 },
		sort,
		groupBy: 'string',
	})

	assert.equal(queryC, queryD)

	assert.notEqual(queryA, queryC)
	assert.notEqual(queryB, queryD)
})

test('already has data', () => {
	table.insert({ number: 0, string: 'a' })

	const table2 = new Table(yTable, schema)
	assert.equal(table2.count({}).result, 1)
})

test('memory management', async () => {
	let query: ReturnType<typeof table.query> | undefined = table.query({})
	const weakQuery = new WeakRef(query)
	query = undefined

	await new Promise((resolve) => setTimeout(resolve, 10))
	global.gc!()
	await new Promise((resolve) => setTimeout(resolve, 10))

	assert.equal(weakQuery.deref(), undefined)
})

test('a collected query is not uncached after its replacement is cached', async () => {
	const tick = () => new Promise((resolve) => setTimeout(resolve, 10))
	;(() => table.count({ filter: { number: 1 } }))()
	await tick()
	global.gc!()
	const q2 = table.count({ filter: { number: 1 } })
	await tick()
	assert.equal(table.count({ filter: { number: 1 } }), q2)
})

test('an undefined filter value is not the same as no filter', () => {
	const optionalTable = new Table(
		doc.getMap('optional') as Y.Map<Y.Map<unknown>>,
		{ id: new Field<UUID>(), number: new Field<number | undefined>() },
	)
	optionalTable.insert({ number: 1 })
	optionalTable.insert({ number: undefined })
	const undefinedCount = optionalTable.count({ filter: { number: undefined } })
	const allCount = optionalTable.count({})
	assert.equal(undefinedCount.result, 1)
	assert.equal(allCount.result, 2)
})

test('a NaN filter value matches NaN rows', () => {
	table.insert({ number: NaN, string: 'a' })
	table.insert({ number: 1, string: 'b' })
	const count = table.count({ filter: { number: NaN } })
	assert.equal(count.result, 1)
	table.insert({ number: NaN, string: 'c' })
	assert.equal(count.result, 2)
})

test('a throwing observer does not stop observers of other queries', (t) => {
	const reported = t.mock.method(globalThis, 'queueMicrotask', () => undefined)
	const query = table.query({ filter: { number: 1 } })
	const count = table.count({ filter: { number: 1 } })
	query.observe(() => {
		throw new Error('query observer')
	})
	let countNotifications = 0
	count.observe(() => countNotifications++)

	table.insert({ number: 1, string: 'a' })
	assert.equal(count.result, 1)
	assert.equal(countNotifications, 1)
	assert.equal(reported.mock.callCount(), 1)
	assert.throws(reported.mock.calls[0].arguments[0]!, /query observer/)
})

test('a throwing observer does not stop sibling observers', (t) => {
	const reported = t.mock.method(globalThis, 'queueMicrotask', () => undefined)
	const query = table.query({ filter: { number: 1 } })
	const notified: string[] = []
	query.observe(() => {
		notified.push('first')
		throw new Error('first')
	})
	query.observe(() => {
		notified.push('second')
		throw new Error('second')
	})
	query.observe(() => notified.push('third'))

	table.insert({ number: 1, string: 'a' })
	assert.deepEqual(notified, ['first', 'second', 'third'])
	assert.equal(reported.mock.callCount(), 2)
	assert.throws(reported.mock.calls[0].arguments[0]!, /first/)
	assert.throws(reported.mock.calls[1].arguments[0]!, /second/)
})

test('inherited object properties are not columns', () => {
	assert.throws(
		// @ts-expect-error not a column
		() => table.query({ filter: { toString: 1 } }),
		/unknown column 'toString'/,
	)
	assert.throws(
		// @ts-expect-error not a column
		() => table.query({ sort: (a, b) => a.toString - b.toString }),
		/unknown column 'toString'/,
	)
})

test('cached count queries are registered once', () => {
	const count = table.count({ filter: { string: 'a' } })
	table.count({ filter: { string: 'a' } })
	_testQueryEntries.value = 0
	table.insert({ number: 1, string: 'a' })
	assert.equal(count.result, 1)
	assert.equal(_testQueryEntries.value, 1)
})

test('groupBy validates its columns', () => {
	assert.throws(
		// @ts-expect-error not a column
		() => table.groupBy({ groupBy: 'nope', subquery: () => table.count({}) }),
		/unknown column 'nope'/,
	)
	assert.throws(
		() =>
			table.groupBy({
				groupBy: 'number',
				// @ts-expect-error not a column
				filter: { nope: 1 },
				subquery: () => table.count({}),
			}),
		/unknown column 'nope'/,
	)
})

// Runs reported errors right away, so node:test doesn't fail on them as uncaught
function catchReports(t: TestContext): unknown[] {
	const reports: unknown[] = []
	t.mock.method(globalThis, 'queueMicrotask', (callback: () => void) => {
		try {
			callback()
		} catch (error) {
			reports.push(error)
		}
	})
	return reports
}

function assertInvalid(
	query: { readonly result: unknown },
	message: string,
	cause: RegExp,
) {
	assert.throws(
		() => query.result,
		(error: Error) => {
			assert.equal(error.message, message)
			assert.match(String(error.cause), cause)
			return true
		},
	)
}

const boom = new Error('boom')

test('a missed read in a sort comparator invalidates the query', (t) => {
	const reports = catchReports(t)
	const query = table.query({
		select: ['string'],
		sort: (a, b) => (a.string === 'x' ? a.number - b.number : 0),
	})
	table.insert({ number: 1, string: 'y' })
	table.insert({ number: 2, string: 'x' })
	assertInvalid(
		query,
		'the sort comparator threw',
		/sort comparator read column 'number'/,
	)
	assert.equal(reports.length, 1)
	assert.throws(
		() => query.result,
		(error) => error === reports[0],
	)
})

test('a missed read leaves the rest of the transaction applied', (t) => {
	const reports = catchReports(t)
	const query = table.query({
		select: ['string'],
		sort: (a, b) => (a.string === 'x' ? a.number - b.number : 0),
	})
	const changes: QueryChange<typeof query>[] = []
	query.observe((change) => changes.push(change))
	const count = table.count({})
	table.insert({ number: 1, string: 'x' })

	doc.transact(() => {
		table.insert({ number: 2, string: 'x' })
		table.insert({ number: 3, string: 'z' })
	})
	assert.deepEqual(
		changes.map(({ kind }) => kind),
		['add', 'invalid'],
	)
	assert.equal(count.result, 3)
	assert.equal(table.count({ filter: { string: 'z' } }).result, 1)
	assert.equal(reports.length, 1)
})

test('a missed read while creating a query throws immediately', () => {
	table.insert({ number: 1, string: 'x' })
	table.insert({ number: 2, string: 'x' })
	assert.throws(
		() =>
			table.query({
				select: ['string'],
				sort: (a, b) => (a.string === 'x' ? a.number - b.number : 0),
			}),
		(error: Error) => {
			assert.match(String(error.cause), /sort comparator read column 'number'/)
			return true
		},
	)
})

test('a sort that throws invalidates its query without stopping the transaction', (t) => {
	const reports = catchReports(t)
	const count = table.count({})
	let countChanges = 0
	count.observe(() => countChanges++)
	const sort = (
		a: { number: number; string: string },
		b: { number: number; string: string },
	) => {
		if (a.string === 'boom' || b.string === 'boom') {
			throw boom
		}
		return a.number - b.number
	}
	const query = table.query({ sort })
	const changes: QueryChange<typeof query>[] = []
	const observer = (change: QueryChange<typeof query>) => changes.push(change)
	query.observe(observer)
	table.insert({ number: 1, string: 'a' })

	let boomId!: UUID
	doc.transact(() => {
		boomId = table.insert({ number: 2, string: 'boom' })
		table.insert({ number: 3, string: 'b' })
	})
	assert.equal(count.result, 3)
	assert.equal(countChanges, 3)
	assertInvalid(query, 'the sort comparator threw', /boom/)
	assert.throws(() => query.version, /the sort comparator threw/)
	assert.throws(
		() => query.observe(() => undefined),
		/the sort comparator threw/,
	)
	query.unobserve(observer)
	assert.equal(reports.length, 1)
	assert.equal((reports[0] as Error).cause, boom)
	assert.deepEqual(
		changes.map(({ kind }) => kind),
		['add', 'invalid'],
	)
	assert.deepEqual(changes[1], {
		kind: 'invalid',
		error: reports[0],
		type: 'update',
	})

	table.update(boomId, 'string', 'c')
	const remade = table.query({ sort })
	assert.notEqual(remade, query)
	assert.deepEqual(
		remade.result.map(({ number }) => number),
		[1, 2, 3],
	)
	table.delete(boomId)
	table.insert({ number: 4, string: 'd' })
	assert.deepEqual(
		remade.result.map(({ number }) => number),
		[1, 3, 4],
	)
	assert.equal(countChanges, 5)
	assert.equal(changes.length, 2)
})

test('a sort that throws while moving a row still applies the update', (t) => {
	catchReports(t)
	const other = table.query({ sort: (a, b) => b.number - a.number })
	let throwing = false
	const query = table.query({
		sort: (a, b) => {
			if (throwing) {
				throw boom
			}
			return a.number - b.number
		},
	})
	const changes: QueryChange<typeof query>[] = []
	query.observe((change) => changes.push(change))
	const aId = table.insert({ number: 1, string: 'a' })
	table.insert({ number: 2, string: 'b' })

	throwing = true
	table.update(aId, 'number', 3)
	throwing = false
	assertInvalid(query, 'the sort comparator threw', /boom/)
	assert.deepEqual(
		changes.map(({ kind }) => kind),
		['add', 'add', 'invalid'],
	)
	assert.deepEqual(
		other.result.map(({ number }) => number),
		[3, 2],
	)
	assert.deepEqual(
		table
			.query({ select: ['number'] })
			.result.map(({ number }) => number)
			.sort(),
		[2, 3],
	)
})

test('a subquery generator that throws on an update leaves the subquery working', (t) => {
	catchReports(t)
	const query = table.query({
		subqueries: {
			same: (row) => {
				if (row.string === 'boom') {
					throw boom
				}
				return table.count({ filter: { string: row.string } })
			},
		},
		sort: (a, b) => a.number - b.number,
	})
	const changes: QueryChange<typeof query>[] = []
	query.observe((change) => changes.push(change))
	const countA = table.count({ filter: { string: 'a' } })
	let countAChanges = 0
	countA.observe(() => countAChanges++)
	const id = table.insert({ number: 1, string: 'a' })

	table.update(id, 'string', 'boom')
	// eslint-disable-next-line quotes
	assertInvalid(query, "subquery 'same' threw", /boom/)
	table.insert({ number: 2, string: 'a' })
	table.insert({ number: 3, string: 'a' })
	assert.equal(countAChanges, 4)
	assert.equal(countA.result, 2)
	assert.deepEqual(
		changes.map(({ kind }) => kind),
		['add', 'invalid'],
	)
})

test('a subquery generator that throws on an add unobserves the subqueries it made', (t) => {
	const reports = catchReports(t)
	const query = table.query({
		subqueries: {
			all: () => table.count({}),
			same: (row) => {
				if (row.string === 'boom') {
					throw boom
				}
				return table.count({ filter: { string: row.string } })
			},
		},
	})
	const changes: QueryChange<typeof query>[] = []
	query.observe((change) => changes.push(change))
	const all = table.count({})
	let allChanges = 0
	all.observe(() => allChanges++)

	const boomId = table.insert({ number: 1, string: 'boom' })
	table.insert({ number: 2, string: 'a' })
	table.delete(boomId)
	assert.equal(allChanges, 3)
	// eslint-disable-next-line quotes
	assertInvalid(query, "subquery 'same' threw", /boom/)
	assert.deepEqual(
		changes.map(({ kind }) => kind),
		['invalid'],
	)
	assert.equal(reports.length, 1)
})

test('a sort that throws on an add unobserves the row subqueries', (t) => {
	catchReports(t)
	const query = table.query({
		subqueries: { all: () => table.count({}) },
		sort: (a, b) => {
			if (a.string === 'boom' || b.string === 'boom') {
				throw boom
			}
			return a.number - b.number
		},
	})
	const changes: QueryChange<typeof query>[] = []
	query.observe((change) => changes.push(change))
	const all = table.count({})
	let allChanges = 0
	all.observe(() => allChanges++)
	table.insert({ number: 1, string: 'a' })

	table.insert({ number: 2, string: 'boom' })
	table.insert({ number: 3, string: 'b' })
	assert.equal(allChanges, 3)
	assertInvalid(query, 'the sort comparator threw', /boom/)
	assert.deepEqual(
		changes.map(({ kind }) => kind),
		['add', 'invalid'],
	)
})

test('a sort that throws while a subquery changes invalidates the parent, not the subquery', (t) => {
	catchReports(t)
	let throwing = false
	const same = (row: { string: string }) =>
		table.count({ filter: { string: row.string } })
	const query = table.query({
		filter: { number: 1 },
		subqueries: { same },
		sort: (a, b) => {
			if (throwing) {
				throw boom
			}
			return a.same - b.same
		},
	})
	const changes: QueryChange<typeof query>[] = []
	query.observe((change) => changes.push(change))
	const sibling = table.query({
		filter: { number: 1 },
		subqueries: { same: (row) => same(row) },
	})
	const countA = table.count({ filter: { string: 'a' } })
	let countAChanges = 0
	countA.observe(() => countAChanges++)
	table.insert({ number: 1, string: 'a' })
	table.insert({ number: 1, string: 'b' })

	throwing = true
	table.insert({ number: 2, string: 'a' })
	throwing = false
	assertInvalid(query, 'the sort comparator threw', /boom/)
	assert.deepEqual(
		changes.map(({ kind }) => kind),
		['add', 'add', 'invalid'],
	)

	table.insert({ number: 3, string: 'a' })
	assert.equal(countA.result, 3)
	assert.equal(countAChanges, 3)
	assert.deepEqual(sibling.result.map((row) => [row.string, row.same]).sort(), [
		['a', 3],
		['b', 1],
	])
	assert.equal(changes.length, 3)
})

test('a sort that throws while rows share a subquery invalidates the query once', (t) => {
	const reports = catchReports(t)
	let throwing = false
	const query = table.query({
		filter: { string: 'x' },
		subqueries: { all: () => table.count({}) },
		sort: (a, b) => {
			if (throwing) {
				throw boom
			}
			return a.number - b.number
		},
	})
	const changes: QueryChange<typeof query>[] = []
	query.observe((change) => changes.push(change))
	table.insert({ number: 1, string: 'x' })
	table.insert({ number: 2, string: 'x' })
	table.insert({ number: 3, string: 'x' })
	const all = table.count({})
	let allChanges = 0
	all.observe(() => allChanges++)
	changes.length = 0

	// Changes only the subquery, so each row's update runs inside the next row's
	throwing = true
	table.insert({ number: 4, string: 'y' })
	throwing = false
	assertInvalid(query, 'the sort comparator threw', /boom/)
	assert.deepEqual(
		changes.map(({ kind }) => kind),
		['invalid'],
	)
	assert.equal(reports.length, 1)
	table.insert({ number: 5, string: 'y' })
	assert.equal(allChanges, 2)
	assert.equal(changes.length, 1)
})

test('queries made from an invalid query are invalid', (t) => {
	catchReports(t)
	let throwing = false
	const sort = (a: { number: number }, b: { number: number }) => {
		if (throwing) {
			throw boom
		}
		return a.number - b.number
	}
	const full = table.query({ sort })
	const window = table.query({ sort, limit: 1 })
	const grouped = table.query({ groupBy: 'string', sort })
	const parent = table.query({ subqueries: { sorted: () => full } })
	const subqueryWindow = table.query({
		subqueries: { all: () => table.count({}) },
		sort,
		limit: 1,
	})
	const kinds = (query: {
		observe(observer: (change: { kind: string }) => void): void
	}) => {
		const result: string[] = []
		query.observe(({ kind }) => result.push(kind))
		return result
	}
	const windowChanges = kinds(window)
	const groupedChanges = kinds(grouped)
	const parentChanges = kinds(parent)
	table.insert({ number: 1, string: 'a' })

	throwing = true
	doc.transact(() => {
		table.insert({ number: 2, string: 'a' })
		table.insert({ number: 3, string: 'a' })
	})
	throwing = false
	for (const query of [full, window, grouped, parent, subqueryWindow]) {
		assertInvalid(query, 'the sort comparator threw', /boom/)
	}
	assert.deepEqual(windowChanges, ['add', 'invalid'])
	assert.deepEqual(groupedChanges, ['addGroup', 'invalid'])
	assert.deepEqual(parentChanges, ['add', 'invalid'])

	assert.deepEqual(
		table.query({ sort, limit: 1 }).result.map(({ number }) => number),
		[1],
	)
})

test('a windowed subquery generator that throws invalidates the window', (t) => {
	catchReports(t)
	const query = table.query({
		subqueries: {
			same: (row) => {
				if (row.string === 'boom') {
					throw boom
				}
				return table.count({ filter: { string: row.string } })
			},
		},
		sort: (a, b) => a.number - b.number,
		limit: 2,
	})
	const changes: QueryChange<typeof query>[] = []
	query.observe((change) => changes.push(change))
	const full = table.query({ sort: (a, b) => a.number - b.number })
	table.insert({ number: 1, string: 'a' })
	table.insert({ number: 2, string: 'boom' })
	table.insert({ number: 0, string: 'b' })
	// eslint-disable-next-line quotes
	assertInvalid(query, "subquery 'same' threw", /boom/)
	assert.deepEqual(
		changes.map(({ kind }) => kind),
		['add', 'invalid'],
	)
	assert.equal(full.result.length, 3)
})

test('a groupBy subquery that throws invalidates the grouped query', (t) => {
	catchReports(t)
	const query = table.groupBy({
		groupBy: 'string',
		subquery: (string) => {
			if (string === 'boom') {
				throw boom
			}
			return table.count({ filter: { string } })
		},
	})
	const all = table.count({})
	let allChanges = 0
	all.observe(() => allChanges++)
	const aId = table.insert({ number: 1, string: 'a' })
	table.insert({ number: 2, string: 'boom' })
	table.update(aId, 'string', 'b')
	assertInvalid(query, 'the groupBy subquery threw', /boom/)
	assert.equal(allChanges, 2)
	assert.equal(table.count({ filter: { string: 'b' } }).result, 1)
})

test('a group added in the transaction that invalidates its query', (t) => {
	catchReports(t)
	const query = table.query({
		groupBy: 'string',
		sort: (a, b) => {
			if (a.number === 99 || b.number === 99) {
				throw boom
			}
			return a.number - b.number
		},
	})
	const changes: string[] = []
	query.observe(({ kind }) => changes.push(kind))
	doc.transact(() => {
		table.insert({ number: 1, string: 'a' })
		table.insert({ number: 99, string: 'a' })
	})
	assertInvalid(query, 'the sort comparator threw', /boom/)
	assert.deepEqual(changes, ['invalid'])
	assert.equal(table.query({ groupBy: 'string' }).result.get('a').length, 2)
})

test('a group invalidated by a sibling group in the same change', (t) => {
	const reports = catchReports(t)
	const query = table.query({
		groupBy: 'string',
		subqueries: { all: () => table.count({}) },
		sort: (a, b) => {
			if (a.string === 'b' && a.all > 4) {
				throw boom
			}
			return a.number - b.number
		},
	})
	const all = table.count({})
	let allChanges = 0
	all.observe(() => allChanges++)
	table.insert({ number: 1, string: 'a' })
	table.insert({ number: 2, string: 'a' })
	table.insert({ number: 3, string: 'b' })
	table.insert({ number: 4, string: 'b' })
	table.insert({ number: 5, string: 'c' })
	assertInvalid(query, 'the sort comparator threw', /boom/)
	assert.equal(reports.length, 1)
	assert.equal(allChanges, 5)
	assert.equal(all.result, 5)
})

test('an invalid query leaves the registry and other tables', (t) => {
	catchReports(t)
	const otherTable = new Table(
		doc.getMap('other') as Y.Map<Y.Map<unknown>>,
		schema,
	)
	const otherQuery = otherTable.query({})
	let otherChanges = 0
	otherQuery.observe(() => otherChanges++)
	const count = table.count({})
	const query = table.query({
		sort: (a, b) => {
			if (a.string === 'b' || b.string === 'b') {
				throw boom
			}
			return 0
		},
	})
	table.insert({ number: 1, string: 'a' })
	doc.transact(() => {
		table.insert({ number: 2, string: 'b' })
		otherTable.insert({ number: 1, string: 'a' })
	})
	assertInvalid(query, 'the sort comparator threw', /boom/)
	assert.equal(otherChanges, 1)
	assert.equal(count.result, 2)

	_testQueryEntries.value = 0
	table.insert({ number: 3, string: 'c' })
	assert.equal(_testQueryEntries.value, 1)
})

test('sort comparators may branch to equality-filtered columns', () => {
	const query = table.query({
		select: ['string'],
		filter: { number: 1 },
		sort: (a, b) => (a.string === 'x' ? a.number - b.number : 0),
	})
	table.insert({ number: 1, string: 'x' })
	table.insert({ number: 1, string: 'x' })
	assert.equal(query.result.length, 2)
})

test('sort comparators may branch when every column is selected', () => {
	const query = table.query({
		sort: (a, b) => (a.string === 'x' ? a.number - b.number : 0),
	})
	table.insert({ number: 2, string: 'x' })
	table.insert({ number: 1, string: 'x' })
	assert.deepEqual(
		query.result.map(({ number }) => number),
		[1, 2],
	)
})
