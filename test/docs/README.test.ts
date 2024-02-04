// start docs Setup
import { UUID, Field, Table } from 'yeeql'
import * as Y from 'yjs'

// end docs Setup
import { expect, test } from 'vitest'
// eslint-disable-next-line no-restricted-imports
import { UpdateDocs } from './updateDocs'
// start docs Observe
import { QueryChange } from 'yeeql'
// end docs

const docs = new UpdateDocs({
	indent: '\t'
})

test('README.md', () => {
	// start docs Setup
	const doc = new Y.Doc()
	const yTable = doc.getMap('dinosaurs') as Y.Map<Y.Map<unknown>>

	const dinosaursSchema = {
		id: new Field<UUID>(),
		genus: new Field<string>(),
		ageInMillionsOfYears: new Field<number>(),
		diet: new Field<'herbivore' | 'carnivore'>(),
	}

	const dinoTable = new Table(yTable, dinosaursSchema)
	// end docs Setup
	// start docs Insert
	dinoTable.insert({
		genus: 'Tyrannosaurus',
		ageInMillionsOfYears: 67,
		diet: 'carnivore',
	})

	dinoTable.insert({
		genus: 'Stegosaurus',
		ageInMillionsOfYears: 152,
		diet: 'herbivore',
	})

	dinoTable.insert({
		genus: 'Triceratops',
		ageInMillionsOfYears: 66,
		diet: 'herbivore',
	})
	// end docs Insert
	// start docs Select
	const herbivoresByAge = dinoTable.query({
		select: ['genus', 'ageInMillionsOfYears'],
		filter: { diet: 'herbivore' },
		sort: (a, b) => a.ageInMillionsOfYears - b.ageInMillionsOfYears,
	})
	herbivoresByAge.result /* {{herbivoresByAge.result 1}} */
	// end docs Select

	const expectedResult = [
		{ genus: 'Triceratops', ageInMillionsOfYears: 66 },
		{ genus: 'Stegosaurus', ageInMillionsOfYears: 152 },
	]

	expect(herbivoresByAge.result).toMatchObject(expectedResult)

	docs.replaceToken('Select', '{{herbivoresByAge.result 1}}', expectedResult)

	const observerLogs: QueryChange<typeof herbivoresByAge>[] = []
	herbivoresByAge.observe((change) => observerLogs.push(change))
	// start docs Observe

	const herbivoresByAgeObserver = (
		change: QueryChange<typeof herbivoresByAge>,
	) => {
		console.log(`herbivoresByAge change ${change}`)
	}

	herbivoresByAge.observe(herbivoresByAgeObserver)

	dinoTable.insert({
		genus: 'Brachiosaurus',
		ageInMillionsOfYears: 150,
		diet: 'herbivore',
	})

	/*
`herbivoresByAgeObserver` logs:
herbivorsByAge change {
	// end docs
*/
	const expectedChange = {
	// start docs Observe
		kind: 'add',
		row: { genus: 'Brachiosaurus', ageInMillionsOfYears: 150 },
		newIndex: 1, // inserts after Triceratops and before Segosaurus according to query `sort` function
		type: 'add', // Indicates that the row was newly added to the table. If the row came into the filter of this query due to an update, is 'update'
	}
	// end docs
	/*
	// start docs Observe
	*/

	herbivoresByAge.result /* {{herbivoresByAge.result 2}} */
	// end docs Observe
	expect(observerLogs[0]).toMatchObject(expectedChange)

	const expectedResult2 = [
		{
			genus: 'Triceratops',
			ageInMillionsOfYears: 66,
		},
		{
			genus: 'Brachiosaurus',
			ageInMillionsOfYears: 150,
		},
		{
			genus: 'Stegosaurus',
			ageInMillionsOfYears: 152,
		},
	]
	expect(herbivoresByAge.result).toMatchObject(expectedResult2)
	docs.replaceToken('Observe', '{{herbivoresByAge.result 2}}', expectedResult2)
	// start docs Observe

	const velociraptorId: UUID = dinoTable.insert({
		genus: 'Velociraptor',
		ageInMillionsOfYears: 72,
		diet: 'carnivore',
	})

	// herbivoresByAgeObserver does not log, since the Velociraptor is not a herbivore
	// end docs Observe

	// start docs Update
	dinoTable.update(velociraptorId, 'diet', 'herbivore')

	/*
	`herbivoresByAgeObserver` logs:
	herbivorsByAge change {
	// end docs
	*/

	const expectedChange2 = {
	// start docs Update
		kind: 'add',
		row: { genus: 'Velociraptor', ageInMillionsOfYears: 72 },
		newIndex: 1, // inserts after Triceratops and before Brachiosaurus according to query `sort` function
		type: 'update' // Indicates that the row newly came into the query's filter due to an update. If the row was newly added, would be 'add'
	}
	// end docs

	expect(observerLogs[1]).toMatchObject(expectedChange2)

	const expectedResult3 = [
		{ genus: 'Triceratops', ageInMillionsOfYears: 66 },
		{ genus: 'Velociraptor', ageInMillionsOfYears: 72 },
		{ genus: 'Brachiosaurus', ageInMillionsOfYears: 150 },
		{ genus: 'Stegosaurus', ageInMillionsOfYears: 152 }
	]

	expect(herbivoresByAge.result).toMatchObject(expectedResult3)

	docs.replaceToken('Update', '{{result3}}', expectedResult3)

	/*
	// start docs Update
	*/
	
	herbivoresByAge.result /* {{result3}} */
	
	dinoTable.update(velociraptorId, 'ageInMillionsOfYears', 160)
	
	/*
	`herbivoresByAgeObserver` logs:
	herbivorsByAge change {
	// end docs
	*/
	const expectedChange3 = {
	// start docs Update
		kind: 'update',
		row: { genus: 'Velociraptor', ageInMillionsOfYears: 160 },
		oldIndex: 1,
		newIndex: 3, // Has moved to the end of the query results because it has the highest age,
		oldValues: { ageInMillionsOfYears: 72 },
		type: 'update' // Always 'update' for `kind: 'update'` changes
	}
	// end docs

	expect(observerLogs[2]).toMatchObject(expectedChange3)

	/*
	// start docs Update
	*/
	// end docs

	// start docs Delete
	dinoTable.delete(velociraptorId)

	/*
	`herbivoresByAgeObserver` logs:
	// end docs
	*/
	const expectedChange4 = {
	// start docs Delete
		kind: 'remove',
		row: { genus: 'Velociraptor', ageInMillionsOfYears: 160 },
		oldIndex: 3,
		type: 'delete'
	}
	// end docs

	expect(observerLogs[3]).toMatchObject(expectedChange4)

	/*
	// start docs Delete
	*/
	// end docs
})
