import { Field, Table, UUID } from 'index'
import * as Y from 'yjs'

import { beforeEach, expect, test, vi } from 'vitest'

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
	expect(query.result.get(1)[0].string).toBe('a')
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

	expect(onlyOnes.result).toStrictEqual([{ id: aId, number: 1, string: 'a' }])
	expect(onlyTwos.result).toStrictEqual([{ id: bId, number: 2, string: 'b' }])

	table.update(aId, 'number', 2)

	expect(onlyOnes.result).toStrictEqual([])
	expect(onlyTwos.result).toStrictEqual([
		{ id: aId, number: 2, string: 'a' },
		{ id: bId, number: 2, string: 'b' },
	])

	expect(onesChanges).toStrictEqual([
		{
			kind: 'remove',
			row: { id: aId, number: 2, string: 'a' },
			oldIndex: 0,
			type: 'update',
		},
	])

	expect(twosChanges).toStrictEqual([
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

	expect(onlyOnes.result).toStrictEqual([])
	expect(onlyTwos.result).toStrictEqual([{ id: aId, number: 2, string: 'a' }])

	expect(onesChanges).toStrictEqual([])

	expect(twosChanges).toStrictEqual([
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

	const observer = vi.fn()

	byNumber.observe(observer)

	table.update(rowId, 'number', 2)

	expect(observer.mock.calls).toStrictEqual([
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
	])
})
