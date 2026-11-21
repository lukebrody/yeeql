import { Field, Table, UUID } from 'index'
import * as Y from 'yjs'

import { beforeEach, test, mock } from 'node:test'
import assert from 'assert/strict'

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

test('simple grouped query', () => {
	;[
		{ number: 1, string: 'a' },
		{ number: 2, string: 'b' },
	].forEach((row) => table.insert(row))
	const query = table.query({ groupBy: 'number' })
	assert.equal(query.result.get(1)[0].string, 'a')
})

test('category hopping', () => {
	const aId = table.insert({ number: 1, string: 'a' })
	const bId = table.insert({ number: 2, string: 'b' })

	const onlyOnes = table.query({
		select: ['id', 'number', 'string'],
		filter: { number: 1 },
		sort: (a, b) => a.string.localeCompare(b.string),
	})

	let onesChanges: string[] = []
	onlyOnes.observe((change) => {
		onesChanges.push(JSON.parse(JSON.stringify(change)))
	})

	const onlyTwos = table.query({
		select: ['id', 'number', 'string'],
		filter: { number: 2 },
		sort: (a, b) => a.string.localeCompare(b.string),
	})

	let twosChanges: string[] = []
	onlyTwos.observe((change) =>
		twosChanges.push(JSON.parse(JSON.stringify(change))),
	)

	assert.deepEqual(onlyOnes.result, [{ id: aId, number: 1, string: 'a' }])
	assert.deepEqual(onlyTwos.result, [{ id: bId, number: 2, string: 'b' }])

	table.update(aId, 'number', 2)

	assert.deepEqual(onlyOnes.result, [])
	assert.deepEqual(onlyTwos.result, [
		{ id: aId, number: 2, string: 'a' },
		{ id: bId, number: 2, string: 'b' },
	])

	assert.deepEqual(onesChanges, [
		{
			kind: 'remove',
			row: { id: aId, number: 2, string: 'a' },
			oldIndex: 0,
			type: 'update',
		},
	])

	assert.deepEqual(twosChanges, [
		{
			kind: 'add',
			row: { id: aId, number: 2, string: 'a' },
			newIndex: 0,
			type: 'update',
		},
	])

	onesChanges = []
	twosChanges = []

	table.update(bId, 'number', 0)

	assert.deepEqual(onlyOnes.result, [])
	assert.deepEqual(onlyTwos.result, [{ id: aId, number: 2, string: 'a' }])

	assert.deepEqual(onesChanges, [])

	assert.deepEqual(twosChanges, [
		{
			kind: 'remove',
			row: { id: bId, number: 0, string: 'b' },
			oldIndex: 1,
			type: 'update',
		},
	])
})

test('groupBy transfer', () => {
	const rowId = table.insert({ number: 1, string: 'a' })

	const byNumber = table.query({ groupBy: 'number' })

	const observer = mock.fn()

	byNumber.observe(observer)

	table.update(rowId, 'number', 2)

	assert.deepEqual(
		observer.mock.calls.map((c) => c.arguments),
		[
			[
				{
					kind: 'subquery',
					result: [],
					group: 1,
					change: {
						kind: 'remove',
						row: {
							id: rowId,
							number: 2,
							string: 'a',
						},
						oldIndex: 0,
						type: 'update',
					},
					type: 'update',
				},
			],
			[
				{
					kind: 'removeGroup',
					group: 1,
					result: [],
					type: 'update',
				},
			],
			[
				{
					kind: 'addGroup',
					group: 2,
					type: 'update',
					result: [
						{
							id: rowId,
							number: 2,
							string: 'a',
						},
					],
				},
			],
		],
	)
})

test('with subqueries', () => {
	const query = table.query({
		groupBy: 'number',
		subqueries: {
			sameString: (row) =>
				table.query({
					filter: { string: row.string },
					sort: (a, b) => a.number - b.number,
				}),
		},
	})

	table.insert({ number: 1, string: 'a' })
	const row2Id = table.insert({ number: 2, string: 'a' })

	assert.equal(query.result.get(1)[0].sameString[1].id, row2Id)
})

function observeGroups(query: {
	observe(
		observer: (change: {
			kind: string
			group: number
			result: readonly { id: UUID }[]
			change?: { kind: string }
		}) => void,
	): void
}) {
	const changes: unknown[] = []
	query.observe((change) =>
		changes.push(
			change.change === undefined
				? [change.kind, change.group, change.result.map(({ id }) => id)]
				: [change.kind, change.group, change.change.kind],
		),
	)
	return changes
}

test('group added in a transaction reports its later rows in addGroup', () => {
	const query = table.query({ select: ['id'], groupBy: 'number' })
	const changes = observeGroups(query)

	doc.transact(() => {
		table.insert({ number: 1, string: 'a' })
		table.insert({ number: 1, string: 'b' })
	})
	assert.deepEqual(changes, [
		['addGroup', 1, query.result.get(1).map(({ id }) => id)],
	])
	assert.equal(query.result.get(1).length, 2)

	changes.length = 0
	table.insert({ number: 1, string: 'c' })
	assert.deepEqual(changes, [['subquery', 1, 'add']])
})

test('returning group whose subquery is still cached', () => {
	const query = table.query({ select: ['id'], groupBy: 'number' })
	const changes = observeGroups(query)
	table.delete(table.insert({ number: 1, string: 'a' }))

	changes.length = 0
	const id = table.insert({ number: 1, string: 'a' })
	assert.deepEqual(changes, [['addGroup', 1, [id]]])
})

test('group added by moving a row reports later rows in addGroup', () => {
	const query = table.query({ select: ['id'], groupBy: 'number' })
	const aId = table.insert({ number: 1, string: 'a' })
	const changes = observeGroups(query)

	doc.transact(() => {
		table.update(aId, 'number', 2)
		table.insert({ number: 2, string: 'b' })
	})
	assert.deepEqual(changes, [
		['addGroup', 2, query.result.get(2).map(({ id }) => id)],
		['subquery', 1, 'remove'],
		['removeGroup', 1, []],
	])
	assert.equal(query.result.get(2).length, 2)
})

test('windowed group added in a transaction reports its later rows in addGroup', () => {
	const query = table.query({
		select: ['id', 'string'],
		groupBy: 'number',
		sort: (a, b) => a.string.localeCompare(b.string),
		offset: 1,
		limit: 1,
	})
	const changes = observeGroups(query)

	let bId: UUID
	doc.transact(() => {
		table.insert({ number: 1, string: 'c' })
		table.insert({ number: 1, string: 'a' })
		bId = table.insert({ number: 1, string: 'b' })
	})
	assert.deepEqual(changes, [['addGroup', 1, [bId!]]])
})

test('group with subqueries added in a transaction reports its later rows in addGroup', () => {
	const query = table.query({
		groupBy: 'number',
		subqueries: {
			sameString: (row) => table.count({ filter: { string: row.string } }),
		},
	})
	const changes: unknown[] = []
	query.observe((change) =>
		changes.push(
			change.kind === 'subquery'
				? [change.kind, change.change.kind]
				: [change.kind, change.result.map((row) => row.sameString)],
		),
	)

	doc.transact(() => {
		table.insert({ number: 1, string: 'a' })
		table.insert({ number: 1, string: 'a' })
	})
	assert.deepEqual(changes, [['addGroup', [2, 2]]])
})

// Count changes have only `delta`
type ReplayChange = {
	kind?: string
	group?: unknown
	result?: unknown
	row?: { id: UUID }
	oldIndex?: number
	newIndex?: number
	key?: string
	delta?: number
	change?: ReplayChange
}
type Replayed = number | Map<unknown, Replayed> | ReplayedRow[]
type ReplayedRow = { id: UUID; subqueries: Record<string, Replayed> }

function snapshot(result: unknown): Replayed {
	if (typeof result === 'number') {
		return result
	}
	if (Array.isArray(result)) {
		return result.map(snapshotRow)
	}
	return new Map(
		Array.from(result as Iterable<[unknown, unknown]>, ([group, rows]) => [
			group,
			snapshot(rows),
		]),
	)
}

function snapshotRow(row: { id: UUID }): ReplayedRow {
	const subqueries: Record<string, Replayed> = {}
	for (const [key, value] of Object.entries(row)) {
		if (!Object.hasOwn(schema, key)) {
			subqueries[key] = snapshot(value)
		}
	}
	return { id: row.id, subqueries }
}

function applyChange(replayed: Replayed, change: ReplayChange): Replayed {
	if (typeof replayed === 'number') {
		return replayed + change.delta!
	}
	if (replayed instanceof Map) {
		if (change.kind === 'addGroup') {
			assert(!replayed.has(change.group))
			replayed.set(change.group, snapshot(change.result))
		} else if (change.kind === 'removeGroup') {
			assert(replayed.delete(change.group))
		} else {
			replayed.set(
				change.group,
				applyChange(replayed.get(change.group)!, change.change!),
			)
		}
		return replayed
	}
	let replayedRow = snapshotRow(change.row!)
	if (change.kind !== 'add') {
		assert.equal(replayed[change.oldIndex!].id, change.row!.id)
		const [oldRow] = replayed.splice(change.oldIndex!, 1)
		if (change.kind === 'subquery') {
			replayedRow = oldRow
			oldRow.subqueries[change.key!] = applyChange(
				oldRow.subqueries[change.key!],
				change.change!,
			)
		}
	}
	if (change.kind !== 'remove') {
		replayed.splice(change.newIndex!, 0, replayedRow)
	}
	return replayed
}

// Returns a check that replaying the changes gives the query's result
function replay(query: {
	result: unknown
	observe(observer: (change: ReplayChange) => void): void
}) {
	let replayed = snapshot(query.result)
	query.observe((change) => (replayed = applyChange(replayed, change)))
	return () => assert.deepEqual(replayed, snapshot(query.result))
}

test('grouped query nested in a grouped query replays a group added in a transaction', () => {
	const nested = table.groupBy({
		groupBy: 'string',
		subquery: (string) =>
			table.query({ select: ['id'], filter: { string }, groupBy: 'number' }),
	})
	const checkReplayed = replay(nested)
	table.insert({ number: 0, string: 'a' })

	doc.transact(() => {
		table.insert({ number: 1, string: 'a' })
		table.insert({ number: 1, string: 'a' })
	})
	checkReplayed()
})

for (const limit of [undefined, 1]) {
	test(`linear query with a grouped subquery replays a group added in a transaction, limit ${limit}`, () => {
		const parents = table.query({
			select: ['id', 'string'],
			filter: { number: 0 },
			subqueries: {
				children: (row) =>
					table.query({
						select: ['id'],
						filter: { string: row.string },
						groupBy: 'number',
					}),
			},
			limit,
		})
		const changes: unknown[] = []
		parents.observe((change) => changes.push(change.kind))
		const checkReplayed = replay(parents)
		table.insert({ number: 0, string: 'a' })

		changes.length = 0
		doc.transact(() => {
			table.insert({ number: 1, string: 'a' })
			table.insert({ number: 1, string: 'a' })
		})
		assert.deepEqual(changes, ['subquery'])
		checkReplayed()
	})
}

for (const limit of [undefined, 2]) {
	test(`linear query sorted by a grouped count replays a group added in a transaction, limit ${limit}`, () => {
		const parents = table.query({
			select: ['id', 'string'],
			filter: { number: 0 },
			subqueries: {
				counts: (row) =>
					table.count({ filter: { string: row.string }, groupBy: 'number' }),
			},
			sort: (a, b) =>
				(a.counts.get(1) ?? 0) - (b.counts.get(1) ?? 0) ||
				a.string.localeCompare(b.string),
			limit,
		})
		const checkReplayed = replay(parents)
		table.insert({ number: 0, string: 'a' })
		table.insert({ number: 0, string: 'b' })
		table.insert({ number: 1, string: 'b' })

		// The second row moves 'a' past 'b' after its group was added
		doc.transact(() => {
			table.insert({ number: 1, string: 'a' })
			table.insert({ number: 1, string: 'a' })
		})
		checkReplayed()
		assert.deepEqual(
			parents.result.map(({ string }) => string),
			['b', 'a'],
		)

		doc.transact(() => {
			table.insert({ number: 2, string: 'b' })
			table.insert({ number: 2, string: 'b' })
		})
		checkReplayed()
	})
}

test('a throw in a transaction still ends it for a grouped query', () => {
	const query = table.query({ select: ['id'], groupBy: 'number' })
	table.query({
		select: ['id', 'string'],
		sort: (a, b) => {
			if (a.string === 'throw' || b.string === 'throw') {
				throw new Error('sort')
			}
			return 0
		},
	})
	table.insert({ number: 2, string: 'a' })
	const changes = observeGroups(query)

	assert.throws(() =>
		doc.transact(() => {
			table.insert({ number: 1, string: 'a' })
			table.insert({ number: 2, string: 'throw' })
		}),
	)
	changes.length = 0
	table.insert({ number: 1, string: 'b' })
	assert.deepEqual(changes, [['subquery', 1, 'add']])
})
