import { UUID, Field, Table } from 'index'
import * as Y from 'yjs'

import { test } from 'node:test'
import assert from 'assert/strict'
import { compareStrings } from 'common/string'
import { seededRandom } from 'test/random'
import { replay as replayWithSubqueries } from 'test/replay'
import { QueryRegistry, addedOrRemoved } from 'yeeql/table/QueryRegistry'

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
		const allRows = (yRows: Y.Map<Y.Map<unknown>>): FuzzRow[] =>
			Array.from(yRows.entries(), ([id, row]) => ({
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
		const throwingSubqueries = {
			groupSize: (row: { group: number }) =>
				table.count({ filter: { group: row.group } }),
		}
		// Throws on a subquery value, so it can fail partway through a subquery's changes
		const throwingSort = (
			a: { label: string; groupSize: number; order: number },
			b: { label: string; groupSize: number; order: number },
		) => {
			// Reads groupSize on the placeholder call too, so its window wraps this query
			if ([a, b].some((row) => row.groupSize >= 7 && row.label === 'z')) {
				throw new Error('fuzz')
			}
			return byOrder(a, b)
		}
		const throwing = table.query({
			select: ['id', 'label', 'order'],
			subqueries: throwingSubqueries,
			sort: throwingSort,
		})

		// Queries that can become invalid, built before any rows so they start valid
		let step = -1
		const probeId = UUID.create()
		const invalidErrors = new Map<object, unknown>()
		const watchInvalidation = (query: {
			result: unknown
			observe(
				observer: (change: { kind: string; error?: unknown }) => void,
			): void
		}) => {
			query.observe((change) => {
				assert(!invalidErrors.has(query))
				if (change.kind === 'invalid') {
					invalidErrors.set(query, change.error)
				}
			})
			return replayWithSubqueries(query, schema)
		}
		const throwingWindow = table.query({
			select: ['id', 'label', 'order'],
			subqueries: throwingSubqueries,
			sort: throwingSort,
			limit: 2,
			offset: 1,
		})
		const generated = (row: { group: number; order: number }) => {
			const { group, order } = row
			if (group === 2 && order === 5) {
				throw new Error('generator')
			}
			return table.count({ filter: { group } })
		}
		const generating = table.query({
			select: ['id', 'order', 'group'],
			subqueries: { generated },
			sort: byOrder,
		})
		const generatingWindow = table.query({
			select: ['id', 'order', 'group'],
			subqueries: { generated },
			sort: byOrder,
			limit: 2,
			offset: 1,
		})
		const throwingGroups = table.groupBy({
			groupBy: 'order',
			subquery: (order) => {
				if (step >= 20 && order === 0) {
					throw new Error('groupBy')
				}
				return table.count({ filter: { order } })
			},
		})
		// Reads `label` only once armed, which the placeholder call didn't see
		const missedReadSort = (
			a: { label: string; order: number },
			b: { label: string; order: number },
		) => (step >= 30 ? compareStrings(a.label, b.label) : 0) || byOrder(a, b)
		const missedRead = table.query({
			select: ['id', 'order'],
			sort: missedReadSort,
		})
		const missedReadWindow = table.query({
			select: ['id', 'order'],
			sort: missedReadSort,
			limit: 2,
			offset: 1,
		})
		const mayFail = [
			{ query: throwing, message: /^the sort comparator threw: fuzz$/ },
			{ query: generating, message: /^subquery 'generated' threw: generator$/ },
			{
				query: generatingWindow,
				message: /^subquery 'generated' threw: generator$/,
			},
			{
				query: throwingGroups,
				message: /^the groupBy subquery threw: groupBy$/,
			},
			{
				query: missedRead,
				message:
					/^the sort comparator threw: the sort comparator read column 'label'/,
			},
		].map((entry) => ({
			...entry,
			checkReplayed: watchInvalidation(entry.query),
		}))
		// Windows only fail through the query under them
		const windowsOver = [
			{ window: throwingWindow, source: throwing },
			{ window: missedReadWindow, source: missedRead },
		].map((entry) => ({
			...entry,
			checkReplayed: watchInvalidation(entry.window),
		}))
		const tableRegistry = (
			table as unknown as {
				queryRegistry: QueryRegistry<typeof schema>
			}
		).queryRegistry

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

		// A second table on the same doc, edited in the same transactions, with subqueries across tables
		const yOther = doc.getMap('other') as Y.Map<Y.Map<unknown>>
		const peerOther = peer.getMap('other') as Y.Map<Y.Map<unknown>>
		const other = new Table(yOther, schema)
		for (let i = 0; i < 3; i++) {
			other.insert(randomValues())
		}
		const countingOther = table.query({
			select: ['id', 'order', 'group'],
			subqueries: {
				otherCount: (row) => other.count({ filter: { group: row.group } }),
			},
			sort: (a, b) => a.otherCount - b.otherCount || byOrder(a, b),
		})
		const listingTable = other.query({
			select: ['id', 'order', 'label'],
			subqueries: {
				sameLabel: (row) =>
					table.query({
						select: ['id', 'order'],
						filter: { label: row.label },
						sort: byOrder,
					}),
			},
			sort: byOrder,
		})
		const checkReplayedCrossTable = [countingOther, listingTable].map((query) =>
			replayWithSubqueries(query, schema),
		)

		const check = () => {
			const rows = allRows(yTable)
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
			for (const { query, message, checkReplayed } of mayFail) {
				const error = invalidErrors.get(query)
				if (error === undefined) {
					checkReplayed()
				} else {
					assert.throws(
						() => query.result,
						(thrown) => thrown === error,
					)
					assert.throws(
						() => query.version,
						(thrown) => thrown === error,
					)
					assert(error instanceof Error && error.cause instanceof Error)
					assert.match(`${error.message}: ${error.cause.message}`, message)
				}
			}
			// A leaked internal observer would touch an invalid query, whose `version` throws, and add a report
			const failedErrors = mayFail
				.map(({ query }) => invalidErrors.get(query))
				.filter((error) => error !== undefined)
			assert.equal(reports.length, failedErrors.length)
			assert.deepEqual(new Set(reports), new Set(failedErrors))
			const byOrderIds = expected(rows, all, byOrder)
			if (!invalidErrors.has(throwing)) {
				assert.deepEqual(ids(throwing.result), byOrderIds)
			}
			if (!invalidErrors.has(missedRead)) {
				assert.deepEqual(ids(missedRead.result), byOrderIds)
			}
			for (const query of [generating, generatingWindow]) {
				if (!invalidErrors.has(query)) {
					for (const row of query.result) {
						assert.equal(row.generated, sizeOf(row as FuzzRow))
					}
				}
			}
			if (!invalidErrors.has(generating)) {
				assert.deepEqual(ids(generating.result), byOrderIds)
			}
			if (!invalidErrors.has(generatingWindow)) {
				assert.deepEqual(ids(generatingWindow.result), byOrderIds.slice(1, 3))
			}
			if (!invalidErrors.has(throwingGroups)) {
				const expectedOrderCounts = new Map<number, number>()
				for (const { order } of rows) {
					expectedOrderCounts.set(
						order,
						(expectedOrderCounts.get(order) ?? 0) + 1,
					)
				}
				assert.deepEqual(new Map(throwingGroups.result), expectedOrderCounts)
			}
			for (const { window, source, checkReplayed } of windowsOver) {
				assert.equal(invalidErrors.get(window), invalidErrors.get(source))
				if (!invalidErrors.has(window)) {
					assert.deepEqual(ids(window.result), byOrderIds.slice(1, 3))
					checkReplayed()
				}
			}
			for (const group of groups) {
				for (const label of labels) {
					for (const order of orders) {
						const row = { id: probeId, group, label, order }
						for (const entry of tableRegistry.queries(row, addedOrRemoved)) {
							assert.equal(entry.error, undefined)
						}
					}
				}
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

			const otherRows = allRows(yOther)
			const otherCountOf = (row: FuzzRow) =>
				otherRows.filter(({ group }) => group === row.group).length
			assert.deepEqual(
				ids(countingOther.result),
				expected(
					rows,
					all,
					(a, b) => otherCountOf(a) - otherCountOf(b) || byOrder(a, b),
				),
			)
			for (const row of countingOther.result) {
				assert.equal(row.otherCount, otherCountOf(row as FuzzRow))
			}
			assert.deepEqual(
				ids(listingTable.result),
				expected(otherRows, all, byOrder),
			)
			for (const row of listingTable.result) {
				assert.deepEqual(
					ids(row.sameLabel),
					expected(rows, ({ label }) => label === row.label, byOrder),
				)
			}
			checkReplayedCrossTable.forEach((checkReplayed) => checkReplayed())
		}

		// Peer edits hit the same rows as local ones before syncing, so updates conflict
		const editRows = (yRows: Y.Map<Y.Map<unknown>>) => {
			const rowIds = Array.from(yRows.keys())
			const action = int(4)
			if (action === 0 || rowIds.length === 0) {
				yRows.set(UUID.create(), new Y.Map(Object.entries(randomValues())))
			} else if (action === 1) {
				yRows.delete(pick(rowIds))
			} else if (action === 2) {
				yRows.set(pick(rowIds), new Y.Map(Object.entries(randomValues())))
			} else {
				const column = pick(['group', 'label', 'order'] as const)
				yRows.get(pick(rowIds))!.set(column, randomValues()[column])
			}
		}
		const sync = () => {
			Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc, Y.encodeStateVector(peer)))
			Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer, Y.encodeStateVector(doc)))
		}

		sync()
		check()
		for (step = 0; step < 60; step++) {
			if (random() < 0.3) {
				const edits = 1 + int(3)
				peer.transact(() => {
					for (let j = 0; j < edits; j++) {
						editRows(peerTable)
					}
					const otherEdits = int(3)
					for (let j = 0; j < otherEdits; j++) {
						editRows(peerOther)
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
				const otherEdits = int(3)
				for (let j = 0; j < otherEdits; j++) {
					editRows(yOther)
				}
			})
			if (random() < 0.5) {
				sync()
			}
			check()
		}
	})
}
