import test from 'node:test'
import assert from 'assert/strict'
// eslint-disable-next-line no-restricted-imports
import { docs } from '../run'
// start docs Table Setup
import { Field, Table, UUID } from 'yeeql'
import * as Y from 'yjs'
// end docs Table Setup

test('Table.md', () => {
	// start docs Table Setup

	// Define your schema
	const schema = {
		id: new Field<UUID>(), // Table schemas must include an `id` column with type `UUID`
		game: new Field<'pinball' | 'skeeball'>(),
		playerName: new Field<string>(),
		score: new Field<number>(),
	}

	// Obtain a Y.Map
	const doc = new Y.Doc()
	const yTable = doc.getMap('scores') as Y.Map<Y.Map<unknown>>

	// Create the table
	const scoresTable = new Table(yTable, schema)
	// end docs Table Setup

	// start docs Table Insert
	const kaylaId: UUID = scoresTable.insert({
		game: 'pinball',
		playerName: 'Kayla',
		score: 900,
	})
	// end docs Table Insert

	// start docs Table Transact
	doc.transact(() => {
		;[
			{ game: 'skeeball' as const, playerName: 'Andreas', score: 800 },
			{ game: 'pinball' as const, playerName: 'Maytal', score: 1200 },
			{ game: 'skeeball' as const, playerName: 'Tomi', score: 700 },
			{ game: 'pinball' as const, playerName: 'Kayla', score: 1000 },
		].forEach((row) => scoresTable.insert(row))
	})
	// end docs Table Transact

	// start docs Table Update
	scoresTable.update(kaylaId, 'score', 1100)
	// end docs Table Update

	// start docs Table Delete
	// Tilt!
	scoresTable.delete(kaylaId)
	// end docs Table Delete

	// start docs Table Query 1
	const highestPinballScores = scoresTable.query({
		select: ['score'],
		filter: { game: 'pinball' },
		sort: (a, b) => b.score - a.score,
	})

	// end docs Table Query 1
	const actual1 =
		// start docs Table Query 1
		highestPinballScores.result // {{expected1}}
	// end docs Table Query 1

	const expected1 = [{ score: 1200 }, { score: 1000 }]

	assert.partialDeepStrictEqual(
		actual1.map(({ score }) => ({ score })),
		expected1,
	)

	docs.replaceToken('Table Query 1', '{{expected1}}', expected1)

	// start docs Table Query 2
	const bestPlayersByGame = scoresTable.query({
		select: ['playerName'],
		sort: (a, b) => b.score - a.score,
		groupBy: 'game',
	})

	// end docs Table Query 2

	const actual2 =
		// start docs Table Query 2
		bestPlayersByGame.result.get('skeeball') // {{expected2}}
	// end docs Table Query 2

	const expected2 = [{ playerName: 'Andreas' }, { playerName: 'Tomi' }]

	assert.partialDeepStrictEqual(
		actual2.map(({ playerName }) => ({ playerName })),
		expected2,
	)

	docs.replaceToken('Table Query 2', '{{expected2}}', expected2)

	const actual3 =
		// start docs Table Count 1
		scoresTable.count({ filter: { game: 'pinball' } }).result // {{actual3}}
	// end docs Table Count 1

	assert.equal(actual3, 2)
	docs.replaceToken('Table Count 1', '{{actual3}}', actual3)

	const actual4 =
		// start docs Table Count 1
		scoresTable.count({}).result // {{actual4}}
	// end docs Table Count 1

	assert.equal(actual4, 4)
	docs.replaceToken('Table Count 1', '{{actual4}}', actual4)

	const actual5 =
		// start docs Table Count 2
		scoresTable.count({ groupBy: 'game' }).result.get('skeeball') // {{actual5}}
	// end docs Table Count 2

	assert.equal(actual5, 2)
	docs.replaceToken('Table Count 2', '{{actual5}}', actual5)
})
