import { UUID, Field, Table } from 'index'
import { expect, test } from 'vitest'
import * as Y from 'yjs'

test(() => {
	const doc = new Y.Doc()
	const yTable = doc.getMap('dinosaurs') as Y.Map<Y.Map<unknown>>

	const dinosaursSchema = {
		id: new Field<UUID>(),
		genus: new Field<string>(),
		ageInMillionsOfYears: new Field<number>(),
		diet: new Field<'herbivore' | 'carnivore'>(),
	}

	const dinoTable = new Table(yTable, dinosaursSchema)

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

	const herbivoresByAge = dinoTable.query({
		select: ['genus', 'ageInMillionsOfYears'],
		filter: { diet: 'herbivore' },
		sort: (a, b) => a.ageInMillionsOfYears - b.ageInMillionsOfYears,
	})

	expect(herbivoresByAge.result).toMatchObject([
		{ genus: 'Triceratops', ageInMillionsOfYears: 66 },
		{ genus: 'Stegosaurus', ageInMillionsOfYears: 152 },
	])
})
