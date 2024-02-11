import { expect, test } from 'vitest'
// start docs Setup
import { UUID, Field, Table } from 'yeeql'
import * as Y from 'yjs'

// end docs Setup
// start docs Observe
import { QueryChange } from 'yeeql'
// end docs Observe
// start docs React Hook
// (Assuming we're using the dinosarus table above)

import React from 'react'
import { useQuery } from 'yeeql'
import { act, render } from '@testing-library/react'
// end docs React Hook

// eslint-disable-next-line no-restricted-imports
import { docs } from '../../docs'

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
	herbivoresByAge.result /* {{result1}} */
	// end docs Select

	const expectedResult = [
		{ genus: 'Triceratops', ageInMillionsOfYears: 66 },
		{ genus: 'Stegosaurus', ageInMillionsOfYears: 152 },
	]

	expect(herbivoresByAge.result).toMatchObject(expectedResult)

	docs.replaceToken('Select', '{{result1}}', expectedResult)

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
	// end docs Observe
*/
	const expectedChange = {
	// start docs Observe
		kind: 'add',
		row: { genus: 'Brachiosaurus', ageInMillionsOfYears: 150 },
		newIndex: 1, // inserts after Triceratops and before Segosaurus according to query `sort` function
		type: 'add', // Indicates that the row was newly added to the table. If the row came into the filter of this query due to an update, is 'update'
	}
	// end docs Observe
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
	// end docs Update
	*/

	const expectedChange2 = {
	// start docs Update
		kind: 'add',
		row: { genus: 'Velociraptor', ageInMillionsOfYears: 72 },
		newIndex: 1, // inserts after Triceratops and before Brachiosaurus according to query `sort` function
		type: 'update' // Indicates that the row newly came into the query's filter due to an update. If the row was newly added, would be 'add'
	}
	// end docs Update

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
	// end docs Update
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
	// end docs Update

	expect(observerLogs[2]).toMatchObject(expectedChange3)

	/*
	// start docs Update
	*/
	// end docs Update

	// start docs Delete
	dinoTable.delete(velociraptorId)

	/*
	`herbivoresByAgeObserver` logs:
	// end docs Delete
	*/
	const expectedChange4 = {
	// start docs Delete
		kind: 'remove',
		row: { genus: 'Velociraptor', ageInMillionsOfYears: 160 },
		oldIndex: 3,
		type: 'delete'
	}
	// end docs Delete

	expect(observerLogs[3]).toMatchObject(expectedChange4)

	/*
	// start docs Delete
	*/
	// end docs Delete

	let renderCount = 0
	// start docs React Hook

	const genusSort = (a: { genus: string }, b: { genus: string }) => a.genus.localeCompare(b.genus)

	function DinoListComponent({ diet }: { diet: 'herbivore' | 'carnivore' }) {
		const dinos = useQuery(() => dinoTable.query({
			select: ['id', 'genus'],
			filter: { diet },
			sort: genusSort
		}), [diet])

		const dinoNames = dinos.map(dino => (
			<p key={dino.id}>
				${dino.genus}
			</p>
		))

		// end docs React Hook
		renderCount++
		// start docs React Hook

		return (
			<>
				<h1>
					${diet}s
				</h1>
				{dinoNames}
			</>
		)
	}

	// end docs React Hook

	render(
		// start docs React Hook
		<DinoListComponent diet='carnivore'/> // Rendered somewhere
		// end docs React Hook
	)

	let allosaurusIdAct: UUID | undefined
	act(() => {
		// start docs React Hook
		const allosaurusId = dinoTable.insert({ genus: 'Allosaurus', ageInMillionsOfYears: 145, diet: 'carnivore' })
		// DinoListComponent re-renders

		// end docs React Hook
		allosaurusIdAct = allosaurusId
	})
	const allosaurusId = allosaurusIdAct!

	expect(renderCount).toBe(2)
	
	// start docs React Hook
	dinoTable.update(allosaurusId, 'ageInMillionsOfYears', 150)
	// DinoListComponent DOES NOT re-render, since 'ageInMillionsOfYears' is not selected in the query

	dinoTable.insert({ genus: 'Styracosaurus', ageInMillionsOfYears: 75, diet: 'herbivore' })
	// DinoListComponent DOES NOT re-render, since Styracosaurus is not a carnivore
	
	// end docs React Hook

	expect(renderCount).toBe(2)

	act(() => {
		// start docs React Hook
		dinoTable.update(allosaurusId, 'genus', 'Allosaurus ❤️')
		// DinoListComponent re-renders, since 'genus' is selected
		// end docs React Hook
	})

	expect(renderCount).toBe(3)

	// start docs Query Caching
	const sort = (a: { genus: string }, b: { genus: string }) =>
		a.genus.localeCompare(b.genus)

	const queryA = dinoTable.query({
		select: ['genus', 'diet'],
		sort,
	})

	const queryB = dinoTable.query({
		select: ['genus', 'diet'],
		sort,
	})

	console.log(queryA !== queryB) // Prints `true`
	// end docs Query Caching
	expect(queryA).toBe(queryB)
})
