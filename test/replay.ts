import { UUID } from 'index'
import assert from 'assert/strict'

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

function snapshot(result: unknown, columns: object): Replayed {
	if (typeof result === 'number') {
		return result
	}
	if (Array.isArray(result)) {
		return result.map((row) => snapshotRow(row, columns))
	}
	return new Map(
		Array.from(result as Iterable<[unknown, unknown]>, ([group, rows]) => [
			group,
			snapshot(rows, columns),
		]),
	)
}

function snapshotRow(row: { id: UUID }, columns: object): ReplayedRow {
	const subqueries: Record<string, Replayed> = {}
	for (const [key, value] of Object.entries(row)) {
		if (!Object.hasOwn(columns, key)) {
			subqueries[key] = snapshot(value, columns)
		}
	}
	return { id: row.id, subqueries }
}

function applyChange(
	replayed: Replayed,
	change: ReplayChange,
	columns: object,
): Replayed {
	if (typeof replayed === 'number') {
		return replayed + change.delta!
	}
	if (replayed instanceof Map) {
		if (change.kind === 'addGroup') {
			assert(!replayed.has(change.group))
			replayed.set(change.group, snapshot(change.result, columns))
		} else if (change.kind === 'removeGroup') {
			assert(replayed.delete(change.group))
		} else {
			replayed.set(
				change.group,
				applyChange(replayed.get(change.group)!, change.change!, columns),
			)
		}
		return replayed
	}
	let replayedRow = snapshotRow(change.row!, columns)
	if (change.kind !== 'add') {
		assert.equal(replayed[change.oldIndex!].id, change.row!.id)
		const [oldRow] = replayed.splice(change.oldIndex!, 1)
		if (change.kind === 'subquery') {
			replayedRow = oldRow
			oldRow.subqueries[change.key!] = applyChange(
				oldRow.subqueries[change.key!],
				change.change!,
				columns,
			)
		}
	}
	if (change.kind !== 'remove') {
		replayed.splice(change.newIndex!, 0, replayedRow)
	}
	return replayed
}

// Returns a check that replaying the changes gives the query's result
export function replay(
	query: {
		result: unknown
		observe(observer: (change: ReplayChange) => void): void
	},
	columns: object,
) {
	let replayed = snapshot(query.result, columns)
	query.observe((change) => {
		if (change.kind !== 'invalid') {
			replayed = applyChange(replayed, change, columns)
		}
	})
	return () => assert.deepEqual(replayed, snapshot(query.result, columns))
}
