import { Field, QueryChange, QueryResult, Table, UUID } from 'index'
import { expect, test } from 'vitest'
import * as Y from 'yjs'
// eslint-disable-next-line no-restricted-imports
import { docs } from '../../docs'

test('Query.md', () => {
	const yDoc = new Y.Doc()
	const yTable = yDoc.getMap('table') as Y.Map<Y.Map<unknown>>
	const changes: QueryChange<typeof titles>[] = []
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
		// ends docs QueryObserve
		changes.push(change)
	// start docs QueryObserve
	}
    
	titles.observe(titlesObserver)
    
	const rowId = songsTable.insert({ title: 'Give Life Back to Music', genre: 'pop' })

	/*
    `titlesObserver` prints:
    {{titlesObserver1}}
    */
	// ends docs QueryObserve
	const titlesObserver1 = {
		kind: 'add',
		row: { id: rowId, title: 'Give Life Back to Music' },
		newIndex: 0,
		type: 'add'
	}
	expect(changes[0]).toMatchObject(titlesObserver1)
	docs.replaceToken('QueryObserve', '{{titlesObserver1}}', titlesObserver1)

	// Should be assignable
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const expected: ExpectedChange<typeof titles.result[0]> = changes[0]

	// start docs QueryObserve
	songsTable.update(rowId, 'genre', 'electronic')
	// `titlesObserver` does not run, since we are not observing the genre
	// end docs QueryObserve
	expect(changes[1]).toBeUndefined()

	// start docs QueryResult
	const query = songsTable.query({ select: ['id'] })

	// QueryResult<typeof query> // ReadonlyArray<{ id: UUID }>
	// end docs QueryResult

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const result: ReadonlyArray<{ id: UUID }> = query.result as QueryResult<typeof query>

	docs.replaceToken('QueryResult', '// QueryResult<typeof query>', 'QueryResult<typeof query>')




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