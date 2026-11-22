import { UUID, Field, Table } from 'index'
import * as Y from 'yjs'

import { test } from 'node:test'
import assert from 'assert/strict'
import { compareStrings } from 'common/string'
import { seededRandom } from 'test/random'
import { replay as replayWithSubqueries } from 'test/replay'

// FUZZ_SEED reproduces one failing seed, FUZZ_SEEDS runs more
const seeds =
	process.env.FUZZ_SEED !== undefined
		? [Number(process.env.FUZZ_SEED)]
		: Array.from({ length: Number(process.env.FUZZ_SEEDS ?? 20) }, (_, i) => i)

const schema = {
	id: new Field<UUID>(),
	group: new Field<number>(),
	label: new Field<string>(),
	order: new Field<number>(),
}

type FuzzRow = { id: UUID; group: number; label: string; order: number }

const groups = [0, 1, 2]
const labels = ['x', 'y', 'z']
const orders = [0, 1, 2, 3, 4, 5, NaN]

// NaN last, so comparators stay consistent
function compareNumbers(a: number, b: number): number {
	return (
		Number(Number.isNaN(a)) - Number(Number.isNaN(b)) ||
		(Number.isNaN(a) ? 0 : a - b)
	)
}
const byOrder = (a: { order: number }, b: { order: number }) =>
	compareNumbers(a.order, b.order)
const byLabel = (a: { label: string }, b: { label: string }) =>
	compareStrings(a.label, b.label)
const byGroupSize = (
	a: { groupSize: number; order: number },
	b: { groupSize: number; order: number },
) => a.groupSize - b.groupSize || byOrder(a, b)

type LinearChange = {
	kind: string
	row: unknown
	oldIndex?: number
	newIndex?: number
}

function applyChange(replayed: unknown[], change: LinearChange) {
	if (change.kind !== 'add') {
		assert.equal(replayed[change.oldIndex!], change.row)
		replayed.splice(change.oldIndex!, 1)
	}
	if (change.kind !== 'remove') {
		replayed.splice(change.newIndex!, 0, change.row)
	}
}

function replay(query: {
	result: readonly unknown[]
	observe(observer: (change: LinearChange | { kind: 'invalid' }) => void): void
}) {
	const replayed = [...query.result]
	query.observe((change) => {
		assert('row' in change)
		applyChange(replayed, change)
	})
	return replayed
}

// Returns a check that the replayed groups match the query's result
function replayGroups(query: {
	result: ReadonlyMap<unknown, readonly unknown[]>
	observe(
		observer: (
			change:
				| {
						kind: string
						group: unknown
						result: readonly unknown[]
						change?: LinearChange
				  }
				| { kind: 'invalid' },
		) => void,
	): void
}) {
	const copy = (groups: ReadonlyMap<unknown, readonly unknown[]>) =>
		new Map(Array.from(groups, ([group, rows]) => [group, [...rows]]))
	const replayed = copy(query.result)
	query.observe((change) => {
		assert('group' in change)
		if (change.kind === 'addGroup') {
			assert(!replayed.has(change.group))
			replayed.set(change.group, [...change.result])
		} else if (change.kind === 'removeGroup') {
			assert(replayed.delete(change.group))
		} else {
			applyChange(replayed.get(change.group)!, change.change!)
		}
	})
	return () => assert.deepEqual(replayed, copy(query.result))
}

const ids = (rows: readonly { id: UUID }[]) => rows.map(({ id }) => id)

for (const seed of seeds) {
	test(`fuzz seed ${seed}`, (context) => {
		const { random, int, pick } = seededRandom(seed)
		context.mock.method(crypto, 'getRandomValues', (array: Uint8Array) => {
			for (let i = 0; i < array.length; i++) {
				array[i] = int(256)
			}
			return array
		})

		// RangeIndex's treap priorities
		context.mock.method(Math, 'random', random)

		// Client ids decide which conflicting edit wins
		const doc = new Y.Doc()
		doc.clientID = 1
		const peer = new Y.Doc()
		peer.clientID = 2
		const yTable = doc.getMap('table') as Y.Map<Y.Map<unknown>>
		const peerTable = peer.getMap('table') as Y.Map<Y.Map<unknown>>
		const table = new Table(yTable, schema)

		const randomValues = () => ({
			group: pick(groups),
			label: pick(labels),
			order: pick(orders),
		})
		const allRows = (): FuzzRow[] =>
			Array.from(yTable.entries(), ([id, row]) => ({
				id: id as UUID,
				group: row.get('group') as number,
				label: row.get('label') as string,
				order: row.get('order') as number,
			}))
		const expected = (
			rows: FuzzRow[],
			filter: (row: FuzzRow) => boolean,
			sort: (a: FuzzRow, b: FuzzRow) => number,
		) =>
			ids(
				rows
					.filter(filter)
					.sort((a, b) => sort(a, b) || compareStrings(a.id, b.id)),
			)

		const reports: unknown[] = []
		context.mock.method(
			globalThis,
			'queueMicrotask',
			(callback: () => void) => {
				try {
					callback()
				} catch (error) {
					reports.push(error)
				}
			},
		)
		// Throws on a subquery value, so it can fail partway through a subquery's changes
		const throwing = table.query({
			select: ['id', 'label', 'order'],
			subqueries: {
				groupSize: (row) => table.count({ filter: { group: row.group } }),
			},
			sort: (a, b) => {
				if ([a, b].some((row) => row.label === 'z' && row.groupSize >= 7)) {
					throw new Error('fuzz')
				}
				return byOrder(a, b)
			},
		})
		const replayedThrowing = [...throwing.result]
		let throwingInvalid = false
		throwing.observe((change) => {
			assert(!throwingInvalid)
			if (change.kind === 'invalid') {
				throwingInvalid = true
			} else {
				applyChange(replayedThrowing, change)
			}
		})

		for (let i = 0; i < 5; i++) {
			table.insert(randomValues())
		}

		const groupSize = (row: { group: number }) =>
			table.count({ filter: { group: row.group } })

		const linear = table.query({ filter: { group: 1 }, sort: byOrder })
		const ranged = table.query({
			select: ['id', 'label'],
			filter: { order: { gte: 1, lt: 4 } },
			sort: byLabel,
		})
		const window = table.query({
			select: ['id', 'order'],
			sort: byOrder,
			limit: 2,
			offset: 1,
		})
		const groupedWindows = table.query({
			select: ['id', 'order'],
			groupBy: 'group',
			sort: byOrder,
			limit: 2,
			offset: 1,
		})
		const groupedCounts = table.count({
			groupBy: 'label',
			filter: { order: { gt: 1 } },
		})
		const nanCount = table.count({ filter: { order: NaN } })
		const sortedBySubquery = table.query({
			select: ['id', 'order', 'group'],
			subqueries: { groupSize },
			sort: byGroupSize,
		})
		const subqueryWindow = table.query({
			select: ['id', 'order', 'group'],
			subqueries: { groupSize },
			sort: byOrder,
			limit: 3,
			offset: 1,
		})
		const sortedBySubqueryWindow = table.query({
			select: ['id', 'order', 'group'],
			subqueries: { groupSize },
			sort: byGroupSize,
			limit: 2,
			offset: 2,
		})
		const groupedBySubquery = table.query({
			select: ['id', 'order'],
			groupBy: 'label',
			subqueries: { groupSize },
			sort: byGroupSize,
			limit: 2,
		})
		const byLabelGroup = (row: { label: string }) =>
			table.query({
				select: ['id', 'order'],
				filter: { label: row.label },
				groupBy: 'group',
				sort: byOrder,
			})
		const withGroupedSubquery = table.query({
			select: ['id', 'order', 'label'],
			subqueries: { byLabelGroup },
			sort: byOrder,
		})
		const windowWithGroupedSubquery = table.query({
			select: ['id', 'order', 'label'],
			subqueries: { byLabelGroup },
			sort: byOrder,
			limit: 2,
			offset: 1,
		})
		const sortedByCountWindow = table.query({
			select: ['id', 'order', 'label'],
			subqueries: {
				labelCount: (row) => table.count({ filter: { label: row.label } }),
			},
			sort: (a, b) => a.labelCount - b.labelCount || byOrder(a, b),
			limit: 3,
			offset: 1,
		})

		const labelCounts = (row: { group: number }) =>
			table.count({ groupBy: 'label', filter: { group: row.group } })
		const byXCount = (
			a: { labelCounts: { get(label: string): number }; order: number },
			b: { labelCounts: { get(label: string): number }; order: number },
		) => a.labelCounts.get('x') - b.labelCounts.get('x') || byOrder(a, b)
		const sortedByGroupedSubquery = table.query({
			select: ['id', 'order', 'group'],
			subqueries: { labelCounts },
			sort: byXCount,
		})
		const sortedByGroupedSubqueryWindow = table.query({
			select: ['id', 'order', 'group'],
			subqueries: { labelCounts },
			sort: byXCount,
			limit: 2,
			offset: 1,
		})
		const checkReplayedSubqueries = [
			sortedBySubquery,
			subqueryWindow,
			sortedBySubqueryWindow,
			groupedBySubquery,
			withGroupedSubquery,
			windowWithGroupedSubquery,
			sortedByCountWindow,
			sortedByGroupedSubquery,
			sortedByGroupedSubqueryWindow,
		].map((query) => replayWithSubqueries(query, schema))

		const replayed = [
			linear,
			ranged,
			window,
			sortedBySubquery,
			subqueryWindow,
			sortedBySubqueryWindow,
			sortedByGroupedSubquery,
			sortedByGroupedSubqueryWindow,
		].map((query) => ({ query, replayed: replay(query) }))
		const checkReplayedGroups = [groupedWindows, groupedBySubquery].map(
			replayGroups,
		)
		let replayedNanCount = nanCount.result
		nanCount.observe((change) => {
			assert('delta' in change)
			replayedNanCount += change.delta
		})
		const replayedGroupedCounts = new Map(groupedCounts.result)
		groupedCounts.observe((change) => {
			assert(change.kind !== 'invalid')
			if (change.kind === 'addGroup') {
				assert(!replayedGroupedCounts.has(change.group))
				replayedGroupedCounts.set(change.group, change.result)
			} else if (change.kind === 'removeGroup') {
				assert(replayedGroupedCounts.delete(change.group))
			} else {
				replayedGroupedCounts.set(
					change.group,
					replayedGroupedCounts.get(change.group)! + change.change.delta,
				)
			}
		})

		const check = () => {
			const rows = allRows()
			const sizeOf = (row: FuzzRow) =>
				rows.filter(({ group }) => group === row.group).length
			const byExpectedGroupSize = (a: FuzzRow, b: FuzzRow) =>
				byGroupSize(
					{ groupSize: sizeOf(a), order: a.order },
					{ groupSize: sizeOf(b), order: b.order },
				)
			const all = () => true
			const xCountOf = (row: FuzzRow) =>
				rows.filter(({ group, label }) => group === row.group && label === 'x')
					.length
			const byExpectedXCount = (a: FuzzRow, b: FuzzRow) =>
				xCountOf(a) - xCountOf(b) || byOrder(a, b)

			assert.deepEqual(
				ids(linear.result),
				expected(rows, ({ group }) => group === 1, byOrder),
			)
			assert.deepEqual(
				ids(ranged.result),
				expected(rows, ({ order }) => order >= 1 && order < 4, byLabel),
			)
			assert.deepEqual(
				ids(window.result),
				expected(rows, all, byOrder).slice(1, 3),
			)

			const expectedGroupedWindows = new Map<number, UUID[]>()
			for (const group of new Set(rows.map((row) => row.group))) {
				const rowsInWindow = expected(
					rows,
					(row) => row.group === group,
					byOrder,
				).slice(1, 3)
				if (rowsInWindow.length > 0) {
					expectedGroupedWindows.set(group, rowsInWindow)
				}
			}
			assert.deepEqual(
				new Map(
					Array.from(groupedWindows.result, ([group, rows]) => [
						group,
						ids(rows),
					]),
				),
				expectedGroupedWindows,
			)

			const expectedCounts = new Map<string, number>()
			for (const row of rows) {
				if (row.order > 1) {
					expectedCounts.set(
						row.label,
						(expectedCounts.get(row.label) ?? 0) + 1,
					)
				}
			}
			assert.deepEqual(new Map(groupedCounts.result), expectedCounts)
			assert.equal(
				nanCount.result,
				rows.filter(({ order }) => Number.isNaN(order)).length,
			)

			assert.deepEqual(
				ids(sortedBySubquery.result),
				expected(rows, all, byExpectedGroupSize),
			)
			assert.deepEqual(
				ids(subqueryWindow.result),
				expected(rows, all, byOrder).slice(1, 4),
			)
			assert.deepEqual(
				ids(sortedBySubqueryWindow.result),
				expected(rows, all, byExpectedGroupSize).slice(2, 4),
			)
			for (const query of [
				sortedBySubquery,
				subqueryWindow,
				sortedBySubqueryWindow,
			]) {
				for (const row of query.result) {
					assert.equal(row.groupSize, sizeOf(row as FuzzRow))
				}
			}

			assert.deepEqual(
				ids(sortedByGroupedSubquery.result),
				expected(rows, all, byExpectedXCount),
			)
			assert.deepEqual(
				ids(sortedByGroupedSubqueryWindow.result),
				expected(rows, all, byExpectedXCount).slice(1, 3),
			)

			const expectedGroupedBySubquery = new Map<string, UUID[]>()
			for (const label of new Set(rows.map((row) => row.label))) {
				expectedGroupedBySubquery.set(
					label,
					expected(
						rows,
						(row) => row.label === label,
						byExpectedGroupSize,
					).slice(0, 2),
				)
			}
			assert.deepEqual(
				new Map(
					Array.from(groupedBySubquery.result, ([label, rows]) => [
						label,
						ids(rows),
					]),
				),
				expectedGroupedBySubquery,
			)

			for (const { query, replayed: rows } of replayed) {
				assert.deepEqual(ids(rows as FuzzRow[]), ids(query.result))
			}
			checkReplayedGroups.forEach((checkReplayed) => checkReplayed())
			if (throwingInvalid) {
				assert.throws(() => throwing.result, /the sort comparator threw/)
				assert.equal(reports.length, 1)
			} else {
				assert.deepEqual(ids(throwing.result), expected(rows, all, byOrder))
				assert.deepEqual(ids(replayedThrowing), ids(throwing.result))
				assert.equal(reports.length, 0)
			}
			checkReplayedSubqueries.forEach((checkReplayed) => checkReplayed())
			assert.equal(replayedNanCount, nanCount.result)
			assert.deepEqual(replayedGroupedCounts, new Map(groupedCounts.result))

			// Built mid-run, from rows that already went through updates
			const fresh = table.query({
				select: ['id', 'order', 'group'],
				subqueries: { freshGroupSize: groupSize },
				sort: (a, b) => a.freshGroupSize - b.freshGroupSize || byOrder(a, b),
				limit: 2,
				offset: 1,
			})
			assert.deepEqual(
				ids(fresh.result),
				expected(rows, all, byExpectedGroupSize).slice(1, 3),
			)
		}

		// Edits the same rows as the local doc before syncing, so updates conflict
		const editPeer = () => {
			const peerIds = Array.from(peerTable.keys())
			const action = int(4)
			if (action === 0 || peerIds.length === 0) {
				peerTable.set(UUID.create(), new Y.Map(Object.entries(randomValues())))
			} else if (action === 1) {
				peerTable.delete(pick(peerIds))
			} else if (action === 2) {
				peerTable.set(pick(peerIds), new Y.Map(Object.entries(randomValues())))
			} else {
				const column = pick(['group', 'label', 'order'] as const)
				peerTable.get(pick(peerIds))!.set(column, randomValues()[column])
			}
		}
		const sync = () => {
			Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc, Y.encodeStateVector(peer)))
			Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer, Y.encodeStateVector(doc)))
		}

		sync()
		check()
		for (let step = 0; step < 60; step++) {
			if (random() < 0.3) {
				const edits = 1 + int(3)
				peer.transact(() => {
					for (let j = 0; j < edits; j++) {
						editPeer()
					}
				})
			}
			const edits = int(4)
			doc.transact(() => {
				for (let j = 0; j < edits; j++) {
					const localIds = Array.from(yTable.keys()) as UUID[]
					const action = int(5)
					if (action === 0 || localIds.length === 0) {
						table.insert(randomValues())
					} else if (action === 1) {
						table.delete(pick(localIds))
					} else if (action === 2) {
						yTable.set(
							pick(localIds),
							new Y.Map(Object.entries(randomValues())),
						)
					} else {
						const column = pick(['group', 'label', 'order'] as const)
						table.update(pick(localIds), column, randomValues()[column])
					}
				}
			})
			if (random() < 0.5) {
				sync()
			}
			check()
		}
	})
}
