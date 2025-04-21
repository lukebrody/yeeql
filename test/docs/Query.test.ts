import { Field, QueryChange, QueryResult, Table, UUID } from 'index'
import assert from 'assert/strict'
import * as Y from 'yjs'
import test from 'node:test'
// eslint-disable-next-line no-restricted-imports
import { docs } from '../run'

test('Query.md', () => {
	const yDoc = new Y.Doc()
	const yTable = yDoc.getMap('table') as Y.Map<Y.Map<unknown>>
	let titlesChanges: QueryChange<typeof titles>[] = []
	// start docs QueryObserve
	const songsSchema = {
		id: new Field<UUID>(),
		title: new Field<string>(),
		genre: new Field<'jazz' | 'electronic' | 'pop' | 'folk'>(),
	}
    
	const songsTable = new Table(yTable, songsSchema)
    
	const titles = songsTable.query({
		select: ['id', 'title'],
		sort: (a, b) => a.title.localeCompare(b.title),
	})
    
	const titlesObserver = (change: QueryChange<typeof titles>) => {
		console.log(change)
		// end docs QueryObserve
		titlesChanges.push(change)
	// start docs QueryObserve
	}
    
	titles.observe(titlesObserver)
    
	const rowId = songsTable.insert({ title: 'Give Life Back to Music', genre: 'pop' })

	/*
	`titlesObserver` prints:
	{{titlesObserver1}}
	*/

	// end docs QueryObserve
	const titlesObserver1 = {
		kind: 'add',
		row: { id: rowId, title: 'Give Life Back to Music' },
		newIndex: 0,
		type: 'add'
	}
	assert.equal(titlesChanges.length, 1)
	assert.partialDeepStrictEqual(titlesChanges[0], titlesObserver1)
	titlesChanges = []
	docs.replaceToken('QueryObserve', '{{titlesObserver1}}', titlesObserver1)

	// Should be assignable
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const expected: ExpectedChange<typeof titles.result[0]> = titlesChanges[0]

	// start docs QueryObserve
	songsTable.update(rowId, 'genre', 'electronic')
	// `titlesObserver` does not run, since we are not observing the genre
	// end docs QueryObserve
	assert.equal(titlesChanges[1], undefined)

	// start docs QueryResult
	const query = songsTable.query({ select: ['id'] })

	// QueryResult<typeof query> // ReadonlyArray<{ id: UUID }>
	// end docs QueryResult

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const result: ReadonlyArray<{ id: UUID }> = query.result as QueryResult<typeof query>

	docs.replaceToken('QueryResult', '// QueryResult<typeof query>', 'QueryResult<typeof query>')

	let byGenreChanges: QueryChange<typeof byGenre>[] = []
	// start docs QueryObserveGroupBy
	const byGenre = songsTable.query({ 
		groupBy: 'genre',
		sort: (a, b) => b.title.localeCompare(a.title) // Reverse alphabetical order
	})
	
	byGenre.observe(change => {
		console.log(change)
		// end docs QueryObserveGroupBy
		byGenreChanges.push(change)
	// start docs QueryObserveGroupBy
	})
	
	// `rowId` is the row of 'Give Life Back to Music' inserted above
	songsTable.update(rowId, 'genre', 'pop')
	
	/*
	byGenre observer logs three changes.

	First, the song is removed from the 'electronic' group:
	{{byGenre1}}

	Then, the electronic group is removed, as it no longer has any entries:
	{{byGenre2}}

	Finally, a new 'pop' group is created with the song:
	{{byGenre3}}

	`titlesObserver` does not log, because no titles were changed
	*/
	// end docs QueryObserveGroupBy

	const expectedByGenreChanges = [
		{
			change: {
				kind: 'remove',
				oldIndex: 0,
				row: {
				  genre: 'pop',
				  id: rowId,
				  title: 'Give Life Back to Music'
				},
				type: 'update'
			},
			group: 'electronic',
			kind: 'subquery',
			result: [],
			type: 'update',
		},
		{
			group: 'electronic',
			kind: 'removeGroup',
			result: [],
			type: 'update'
		},
		{
			group: 'pop',
			kind: 'addGroup',
			result: [
				{
					genre: 'pop',
					id: rowId,
					title: 'Give Life Back to Music'
			  	}
			],
			type: 'update'
		}
	]

	assert.deepEqual(byGenreChanges, expectedByGenreChanges)
	byGenreChanges = []

	docs.replaceToken('QueryObserveGroupBy', '{{byGenre1}}', expectedByGenreChanges[0])
	docs.replaceToken('QueryObserveGroupBy', '{{byGenre2}}', expectedByGenreChanges[1])
	docs.replaceToken('QueryObserveGroupBy', '{{byGenre3}}', expectedByGenreChanges[2])


	const beatItId = 
	// start docs QueryObserveGroupBy2
	songsTable.insert({ title: 'Beat It', genre: 'pop' })

	/*
	`titlesObserver` prints:
	{{titlesObserver2}}

	byGenre observer logs:
	{{byGenre4}}
	*/
	// end docs QueryObserveGroupBy2

	const titlesObserver2 = {
		kind: 'add',
		row: { id: beatItId, title: 'Beat It' },
		newIndex: 0, // Inserted alphabetically before 'Give Life Back to Music'
		type: 'add'
	}

	assert.partialDeepStrictEqual(titlesChanges[0], titlesObserver2)
	titlesChanges = []

	docs.replaceToken('QueryObserveGroupBy2', '{{titlesObserver2}}', titlesObserver2)

	const byGenre4 = {
		change: {
			kind: 'add',
			row: {id: beatItId, title: 'Beat It', genre: 'pop' },
			newIndex: 1, // Inserted reverse-alphabetically after 'Give Life Back to Music'
			type: 'add',
		},
		group: 'pop'
	}
	
	assert.partialDeepStrictEqual(byGenreChanges[0], byGenre4)
	byGenreChanges = []

	docs.replaceToken('QueryObserveGroupBy2', '{{byGenre4}}', byGenre4)

	// start docs QueryObserveGroupBy2
	// Change title of 'Give Life Back to Music'
	songsTable.update(titles.result[1].id, 'title', 'Around the World')

	/*
	`titlesObserver` logs:
	{{titlesObserver3}}

	byGenre observer logs:
	{{byGenre5}}
	*/
	// end docs QueryObserveGroupBy2
	const titlesObserver3 = {
		kind: 'update',
		row: { id: rowId, title: 'Around the World' },
		oldIndex: 1,
		newIndex: 0, // Has moved before 'Beat It' alphabetically
		oldValues: { title: 'Give Life Back to Music' },
		type: 'update'
	}

	assert.partialDeepStrictEqual(titlesChanges[0], titlesObserver3)
	titlesChanges = []

	docs.replaceToken('QueryObserveGroupBy2', '{{titlesObserver3}}', titlesObserver3)

	const byGenre5 = {
		change: {
			kind: 'update',
			row: { id: rowId, title: 'Around the World', genre: 'pop' },
			oldIndex: 0,
			newIndex: 1, // Has moved reverse-alphabetically after 'Beat It'
			oldValues: { title: 'Give Life Back to Music' },
		},
		type: 'update',
		group: 'pop'
	}

	assert.partialDeepStrictEqual(byGenreChanges[0], byGenre5)
	byGenreChanges = []

	docs.replaceToken('QueryObserveGroupBy2', '{{byGenre5}}', byGenre5)

	// start docs CountObserve
	const popSongs = songsTable.count({ filter: { genre: 'pop' }})
	const genreCounts = songsTable.count({ groupBy: 'genre' })

	popSongs.observe(change => console.log(change))
	genreCounts.observe(change => console.log(change))
	// end docs CountObserve
	
	let popSongsChanges: QueryChange<typeof popSongs>[] = []
	popSongs.observe(change => popSongsChanges.push(change))

	let genreCountsChanges: QueryChange<typeof genreCounts>[] = []
	genreCounts.observe(change => genreCountsChanges.push(change))

	// Should be assignable
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const expected2: GroupedCountChange<string> = genreCountsChanges[0]

	// start docs CountObserve
	
	// Remove 'Around the World'
	songsTable.delete(titles.result[0].id)

	/*
	`titlesObserver` logs:
	{{expectedTitlesChange}}

	byGenre observer logs:
	{{expectedByGenreChange}}

	popSongs observer logs: {{expectedPopSongsChange}}

	genreCounts observer logs: {{expectedGenreCountsChange}}
	*/
	// end docs CountObserve

	const expectedTitlesChange = {
		kind: 'remove',
		row: { id: rowId, title: 'Around the World' },
		oldIndex: 0,
		type: 'delete'
	}

	const expectedByGenreChange = {
		change: {
			kind: 'remove',
			row: { id: rowId, title: 'Around the World', genre: 'pop' },
			oldIndex: 1,
		},
		type: 'delete',
		group: 'pop'
	}

	const expectedPopSongsChange = { delta: -1, type: 'delete' }

	const expectedGenreCountsChange = { kind: 'subquery', group: 'pop', change: { delta: -1, type: 'delete' } }

	assert.partialDeepStrictEqual(titlesChanges[0], expectedTitlesChange)
	titlesChanges = []
	assert.partialDeepStrictEqual(byGenreChanges[0], expectedByGenreChange)
	byGenreChanges = []
	assert.partialDeepStrictEqual(popSongsChanges[0], expectedPopSongsChange)
	popSongsChanges = []
	assert.partialDeepStrictEqual(genreCountsChanges[0], expectedGenreCountsChange)
	genreCountsChanges = []

	docs.replaceToken('CountObserve', '{{expectedTitlesChange}}', expectedTitlesChange)
	docs.replaceToken('CountObserve', '{{expectedByGenreChange}}', expectedByGenreChange)
	docs.replaceToken('CountObserve', '{{expectedPopSongsChange}}', expectedPopSongsChange)
	docs.replaceToken('CountObserve', '{{expectedGenreCountsChange}}', expectedGenreCountsChange)

	// start docs Unobserve
	titles.unobserve(titlesObserver)
	// end docs Unobserve

	const xtalId =
	// start docs Unobserve
	songsTable.insert({ title: 'Xtal', genre: 'electronic' })

	/*
	`titlesObserver` is not called

	byGenre observer logs:
	{{byGenre6}}

	popSongs observer is not called

	genreCounts observer logs: {{genreCounts1}}
	*/
	// end docs Unobserve

	const byGenre6 = {
		kind: 'addGroup',
		result: [
			{
				genre: 'electronic',
				id: xtalId,
				title: 'Xtal'
			}
		],
		type: 'add',
		group: 'electronic'
	}
	assert.equal(byGenreChanges.length, 2)
	assert.partialDeepStrictEqual(byGenreChanges[0], byGenre6)
	// 2nd change is a subquery thing, we can leave it out of the docs for brevity
	byGenreChanges = []
	docs.replaceToken('Unobserve', '{{byGenre6}}', byGenre6)

	const genreCounts1 = {
		group: 'electronic',
		kind: 'addGroup',
		result: 1,
		type: 'add'
	}
	assert.partialDeepStrictEqual(genreCountsChanges[0], genreCounts1)
	genreCountsChanges = []
	docs.replaceToken('Unobserve', '{{genreCounts1}}', genreCounts1)

	// start docs Observer Ordering
	// Assuming we've removed all previous observers

	const electronicSongs = songsTable.count({ filter: { genre: 'electronic' }})

	const printReport = () => {
		console.log(`There are ${popSongs.result} pop songs and ${electronicSongs.result} electronic songs`)
	}

	popSongs.observe(printReport)
	electronicSongs.observe(printReport)

	// Change 'Beat It''s genre from pop to electronic
	songsTable.update(titles.result[0].id, 'genre', 'electronic')

	/*
	`printReport` is called twice, once because it's observing `popSongs`, and again because it's observing `electronicSongs`

	It logs the following:

	There are 0 pop songs and 2 electronic songs
	There are 0 pop songs and 2 electronic songs
	*/
	// end docs Observer Ordering
})

type ExpectedChange<Result> =
// start docs QueryChange
{
    kind: 'add',
    row: Readonly<Result>,
    newIndex: number, // The index in the query result array where the row was inserted
    type: 'add' | 'update' // 'add' if the row is newly added to the table, 'update' if an update caused it to come into scope of this query
} |
{
    kind: 'remove',
    row: Readonly<Result>,
    oldIndex: number,
    type: 'delete' | 'update'
} |
{
    kind: 'update',
    row: Readonly<Result>, // The row after the update
    oldIndex: number,
    newIndex: number,
    oldValues: Readonly<Partial<Result>> // Of the columns that changed, these are the old values
    type: 'update'
}
// end docs QueryChange

type GroupedCountChange<Group> = 
// start docs GroupedCountChange
{
	kind: 'addGroup', 
	group: Group,
	result: number,
	type: 'add' | 'update' 
} |
{
	kind: 'removeGroup', 
	group: Group,
	result: number,
	type: 'delete' | 'update' 
} |
{ 
	kind: 'subquery',
	group: Group, 
	change: { 
		delta: 1,
		type: 'add' | 'update'
	} | {
		delta: -1,
		type: 'delete' | 'update'
	}
}
// end docs GroupedCountChange
