// eslint-disable-next-line no-restricted-imports
import { UUID, Field, Table } from '../lib/index'
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

test('Table.insert', () => {
	const aId = table.insert({ number: 1, string: 'a' })

	const queryAll = table.query({
		select: ['id', 'number', 'string'],
		sort: (a, b) => a.number - b.number,
	})

	expect(queryAll.result).toStrictEqual([{ id: aId, number: 1, string: 'a' }])

	const bId = table.insert({ number: 2, string: 'b' })

	expect(queryAll.result).toStrictEqual([
		{ id: aId, number: 1, string: 'a' },
		{ id: bId, number: 2, string: 'b' },
	])

	table.update(aId, 'number', 3)

	expect(queryAll.result).toStrictEqual([
		{ id: bId, number: 2, string: 'b' },
		{ id: aId, number: 3, string: 'a' },
	])
})

test('Table.multipleQueries', () => {
	const bId = table.insert({ number: 1, string: 'b' })

	const sortByNumber = table.query({
		select: ['id', 'number', 'string'],
		sort: (a, b) => a.number - b.number,
	})
	const sortByString = table.query({
		select: ['id', 'number', 'string'],
		sort: (a, b) => a.string.localeCompare(b.string),
	})

	expect(sortByNumber.result).toStrictEqual([
		{ id: bId, number: 1, string: 'b' },
	])
	expect(sortByString.result).toStrictEqual([
		{ id: bId, number: 1, string: 'b' },
	])

	const aId = table.insert({ number: 2, string: 'a' })

	expect(sortByNumber.result).toStrictEqual([
		{ id: bId, number: 1, string: 'b' },
		{ id: aId, number: 2, string: 'a' },
	])
	expect(sortByString.result).toStrictEqual([
		{ id: aId, number: 2, string: 'a' },
		{ id: bId, number: 1, string: 'b' },
	])

	table.update(bId, 'number', 3)
	table.update(bId, 'string', '0')

	expect(sortByNumber.result).toStrictEqual([
		{ id: aId, number: 2, string: 'a' },
		{ id: bId, number: 3, string: '0' },
	])
	expect(sortByString.result).toStrictEqual([
		{ id: bId, number: 3, string: '0' },
		{ id: aId, number: 2, string: 'a' },
	])
})

test('Table.filter', () => {
	const aId = table.insert({ number: 1, string: 'a' })
	table.insert({ number: 2, string: 'b' })

	const onlyOnes = table.query({
		select: ['id', 'number', 'string'],
		filter: { number: 1 },
		sort: (a, b) => a.string.localeCompare(b.string),
	})

	expect(onlyOnes.result).toStrictEqual([{ id: aId, number: 1, string: 'a' }])

	let dId: UUID | undefined
	doc.transact(() => {
		table.insert({ number: 2, string: 'c' })
		dId = table.insert({ number: 1, string: 'd' })
	})

	expect(onlyOnes.result).toStrictEqual([
		{ id: aId, number: 1, string: 'a' },
		{ id: dId, number: 1, string: 'd' },
	])
})

test('Table.select', () => {
	const aId = table.insert({ number: 1, string: 'a' })

	const excludeString = table.query({
		select: ['id', 'number'],
		sort: (a, b) => a.number - b.number,
	})

	const observer = vi.fn()

	excludeString.observe(observer)

	table.update(aId, 'string', 'a1')

	expect(observer).not.toBeCalled()

	table.update(aId, 'number', 2)

	expect(observer).toBeCalled()
})

test('Table.categoryHopping', () => {
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

// TODO: Improve/add another this test to check additional cache layers
test('Table.cachedQueries', () => {
	const queryA = table.query({
		select: ['id'],
		filter: { number: 3 },
	})

	const queryB = table.query({
		select: ['id'],
		filter: { number: 3 },
	})

	expect(queryA).toBe(queryB)

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

	expect(queryC).toBe(queryD)

	expect(queryA).not.toBe(queryC)
	expect(queryB).not.toBe(queryD)
})

test('Table.selectTypeChecking', () => {
	expect(
		() =>
			table.query({
				// @ts-expect-error Can't select unknown column id2
				select: ['id2'],
			}),
		// eslint-disable-next-line quotes
	).toThrow("unknown column 'id2'")
})

test('Table.filterTypeChecking', () => {
	expect(
		() =>
			table.query({
				select: ['id'],
				// @ts-expect-error Can't filter by unknown column number2
				filter: { number2: 1 },
			}),
		// eslint-disable-next-line quotes
	).toThrow("unknown column 'number2'")
})

test('Table.groupByTypeChecking', () => {
	expect(
		() =>
			table.count({
				// @ts-expect-error Can't group by uknown column string2
				groupBy: 'string2',
			}),
		// eslint-disable-next-line quotes
	).toThrow("unknown column 'string2'")
})

test('Table.sortTypeChecking', () => {
	expect(
		() =>
			table.query({
				select: [],
				// @ts-expect-error Can't sort by unknown column string2
				sort: (a, b) => a.string2.localeCompare(b.string2),
			}),
		// eslint-disable-next-line quotes
	).toThrow("unknown column 'string2' used in 'sort' comparator")
})

test('Table.sorting', () => {
	const aId = table.insert({ number: 2, string: 'a' })
	const bId = table.insert({ number: 1, string: 'b' })

	const query = table.query({
		select: ['id'],
		sort: (a, b) => {
			if (a.number !== b.number) {
				return a.number - b.number
			} else {
				return a.string.localeCompare(b.string)
			}
		},
	})

	// @ts-expect-error number was not selecgted
	query.result[0].number

	// @ts-expect-error string was not selected
	query.result[0].string

	expect(query.result).toStrictEqual([
		{ id: bId, number: 1, string: 'b' },
		{ id: aId, number: 2, string: 'a' },
	])

	table.update(aId, 'number', 1)

	expect(query.result).toStrictEqual([
		{ id: aId, number: 1, string: 'a' },
		{ id: bId, number: 1, string: 'b' },
	])
})

test('Table.groupByTransfer', () => {
	const rowId = table.insert({ number: 1, string: 'a' })

	const byNumber = table.query({ groupBy: 'number' })

	const observer = vi.fn()

	byNumber.observe(observer)

	table.update(rowId, 'number', 2)

	expect(observer).toBeCalledTimes(2)
	expect(observer).toHaveBeenNthCalledWith(1, {
		kind: 'remove',
		row: { id: rowId, number: 2, string: 'a' },
		oldIndex: 0,
		type: 'update',
		group: 1,
	})
	expect(observer).toHaveBeenNthCalledWith(2, {
		kind: 'add',
		row: { id: rowId, number: 2, string: 'a' },
		newIndex: 0,
		type: 'update',
		group: 2,
	})
})

test('Table.preserveRowReferenceOnUpdate', () => {
	table.insert({ number: 1, string: 'a' })
	const query = table.query({})
	const row = query.result[0]
	table.update(row.id, 'string', 'b')
	expect(query.result[0]).toBe(row)
})
