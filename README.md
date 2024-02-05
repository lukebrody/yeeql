# yeeql

# [API Documentation](https://github.com/lukebrody/yeeql/blob/main/doc/index.md)

![yee dinosaur](https://github.com/lukebrody/yeeql/blob/main/image/yee.gif)

yeeql (pronounced yee-quel) is a wrapper atop of [`Y.js`'s `Y.Map`](https://docs.yjs.dev/api/shared-types/y.map).

It allows for creating schematized SQL-like queries on top of `Y.Map`s.

## Features

- `select`, `filter`, `sort`, `groupBy`, `count`
- subscribe to query changes
- React support with `useQuery`
- Nested queries (subqueries)

## Install

```
npm install yeeql
```

## Example

### Setup

<!---Setup-->

```typescript
import { UUID, Field, Table } from 'yeeql'
import * as Y from 'yjs'

const doc = new Y.Doc()
const yTable = doc.getMap('dinosaurs') as Y.Map<Y.Map<unknown>>

const dinosaursSchema = {
	id: new Field<UUID>(),
	genus: new Field<string>(),
	ageInMillionsOfYears: new Field<number>(),
	diet: new Field<'herbivore' | 'carnivore'>(),
}

const dinoTable = new Table(yTable, dinosaursSchema)
```

### Inserting Rows

<!---Insert-->

```typescript
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
```

### Selecting Rows

<!---Select-->

```typescript
const herbivoresByAge = dinoTable.query({
	select: ['genus', 'ageInMillionsOfYears'],
	filter: { diet: 'herbivore' },
	sort: (a, b) => a.ageInMillionsOfYears - b.ageInMillionsOfYears,
})
herbivoresByAge.result /* {{result1}} */
```

### Observing Changes

<!---Observe-->

```typescript
import { QueryChange } from 'yeeql'

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
	kind: 'add',
	row: { genus: 'Brachiosaurus', ageInMillionsOfYears: 150 },
	newIndex: 1, // inserts after Triceratops and before Segosaurus according to query `sort` function
	type: 'add', // Indicates that the row was newly added to the table. If the row came into the filter of this query due to an update, is 'update'
}
*/

herbivoresByAge.result /* {{herbivoresByAge.result 2}} */

const velociraptorId: UUID = dinoTable.insert({
	genus: 'Velociraptor',
	ageInMillionsOfYears: 72,
	diet: 'carnivore',
})

// herbivoresByAgeObserver does not log, since the Velociraptor is not a herbivore
```

### Updating Rows

<!---Update-->

```typescript
dinoTable.update(velociraptorId, 'diet', 'herbivore')

/*
`herbivoresByAgeObserver` logs:
herbivorsByAge change {
	kind: 'add',
	row: { genus: 'Velociraptor', ageInMillionsOfYears: 72 },
	newIndex: 1, // inserts after Triceratops and before Brachiosaurus according to query `sort` function
	type: 'update' // Indicates that the row newly came into the query's filter due to an update. If the row was newly added, would be 'add'
}
*/

herbivoresByAge.result /* {{result3}} */

dinoTable.update(velociraptorId, 'ageInMillionsOfYears', 160)

/*
`herbivoresByAgeObserver` logs:
herbivorsByAge change {
	kind: 'update',
	row: { genus: 'Velociraptor', ageInMillionsOfYears: 160 },
	oldIndex: 1,
	newIndex: 3, // Has moved to the end of the query results because it has the highest age,
	oldValues: { ageInMillionsOfYears: 72 },
	type: 'update' // Always 'update' for `kind: 'update'` changes
}
*/
```

### Deleting Rows

<!---Delete-->

```typescript
dinoTable.delete(velociraptorId)

/*
`herbivoresByAgeObserver` logs:
	kind: 'remove',
	row: { genus: 'Velociraptor', ageInMillionsOfYears: 160 },
	oldIndex: 3,
	type: 'delete'
}
*/
```

## React hook

<!---React Hook-->

```typescript
// (Assuming we're using the dinosarus table above)

import React from 'react'
import { useQuery } from 'yeeql'
import { act, render } from '@testing-library/react'

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


return (
	<>
		<h1>
			${diet}s
		</h1>
		{dinoNames}
	</>
)
	}

<DinoListComponent diet='carnivore'/> // Rendered somewhere
const allosaurusId = dinoTable.insert({ genus: 'Allosaurus', ageInMillionsOfYears: 145, diet: 'carnivore' })
// DinoListComponent re-renders

dinoTable.update(allosaurusId, 'ageInMillionsOfYears', 150)
// DinoListComponent DOES NOT re-render, since 'ageInMillionsOfYears' is not selected in the query

dinoTable.insert({ genus: 'Styracosaurus', ageInMillionsOfYears: 75, diet: 'herbivore' })
// DinoListComponent DOES NOT re-render, since Styracosaurus is not a carnivore

dinoTable.update(allosaurusId, 'genus', 'Allosaurus ❤️')
// DinoListComponent re-renders, since 'genus' is selected
```

# [API Documentation](https://github.com/lukebrody/yeeql/blob/main/doc/index.md)

# Correctness

- [100% test coverage](coverage/index.html)
- Predictable handling of Y.js transactions. (At the end of the transaction, all observers are called with a consistent view of all tables.)

# Performance

## Runtimes

yeeql has a `O(QD)` runtime when a row is inserted, updated, or deleted, where:

- `Q` is the number of queries whose result is affected by the operation.
- `D` is the number of fields of the row.

This is notably better than the naive runtime of `O(ND)` where we must check each query to see if an operation has affected its result.

## Query Cleanup

Queries are only weakly referenced by the table, and once they are garbage collected, they're no longer updated (obviously). This saves memory and runtime.

## Query Caching

The `Table` weakly caches queries, and returns the same instance for duplicate queries. This additionally saves runtime and memory.

### Example

<!---Query Caching-->

```typescript
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
```

Note how the `genusSort` function is the same instance. Prefer using common instances for each type of `sort` function you use. This way yeeql can more effectively re-use queries, since it knows the `sort` function is the same.

## No Copying

Once a row is constructed from the `Y.Table`, it is reused across all queries. Each query maintains its result using these rows. The query result is not copied on access, so if you reference a query's `result`, that array will change as the query's result changes.

# Future Work

- Non-literal (Less Than, Greater Than) filter parameters. (Should be possible using a datastructure that maps segments of a domain to different values.)
- `LIMIT` and `OFFSET` equivalents.
- Option to validate rows and only include rows from peers with a correct schema.
