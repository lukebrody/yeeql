import { Field, QueryChange, QueryResult, UUID } from 'yeeql'
import { test } from 'node:test'
import { Query } from 'yeeql/query/Query'
import * as Y from 'yjs'
// eslint-disable-next-line no-restricted-imports
import { docs } from '../run'
// start docs useQuery1
import React from 'react'
import { useQuery, Table } from 'yeeql'
// end docs useQuery1

type AnyQuery = Query<any, any, any>

// start docs useQuery Signature
function useQuery2<Q extends AnyQuery>(
	makeQuery: () => Q,
	deps: React.DependencyList | undefined,
	observe?: (change: QueryChange<Q>) => void,
): QueryResult<Q> {
// end docs useQuery Signature
	throw new Error('not implemented')
}

function typeCheck(f: typeof useQuery & typeof useQuery2) {
	//
}
typeCheck(useQuery2)
typeCheck(useQuery)

test('useQuery.md', () => {
	docs.replaceToken('useQuery Signature', 'useQuery2', 'useQuery')

	const doc = new Y.Doc()
	const yTable = doc.getMap('dinosaurs') as Y.Map<Y.Map<unknown>>

	const dinosaursSchema = {
		id: new Field<UUID>(),
		genus: new Field<string>(),
		ageInMillionsOfYears: new Field<number>(),
		diet: new Field<'herbivore' | 'carnivore'>(),
	}

	const dinoTable = new Table(yTable, dinosaursSchema)

	// start docs useQuery1

	const genusSort = (a: { genus: string }, b: { genus: string }) => a.genus.localeCompare(b.genus)

	function DinoListComponent({ diet, dinoTable }: {
		diet: 'herbivore' | 'carnivore',
		dinoTable: Table<typeof dinosaursSchema>
	}) {
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

		return (
			<>
				<h1>
					${diet}s
				</h1>
				{dinoNames}
			</>
		)
	}

	<DinoListComponent diet='carnivore' dinoTable={dinoTable}/> // Rendered somewhere

	const allosaurusId = dinoTable.insert({ genus: 'Allosaurus', ageInMillionsOfYears: 145, diet: 'carnivore' })
	// DinoListComponent re-renders

	dinoTable.update(allosaurusId, 'ageInMillionsOfYears', 150)
	// DinoListComponent DOES NOT re-render, since 'ageInMillionsOfYears' is not selected in the query

	dinoTable.insert({ genus: 'Styracosaurus', ageInMillionsOfYears: 75, diet: 'herbivore' })
	// DinoListComponent DOES NOT re-render, since Styracosaurus is not a carnivore

	dinoTable.update(allosaurusId, 'genus', 'Allosaurus ❤️')
	// DinoListComponent re-renders, since 'genus' is selected
	// end docs useQuery1
})
