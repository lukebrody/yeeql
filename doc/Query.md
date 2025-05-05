# `Query<Result, Change>`

Create a `Query` using `table.query` or `table.count`.

## `query.result: Result`

Contains the result of the query. Automatically updates when the underlying data changes.

You can use the `QueryResult` utility type to get the result type from a `Query` type.

### Example

<!---QueryResult-->

```typescript
const query = songsTable.query({ select: ['id'] })

QueryResult<typeof query> // ReadonlyArray<{ id: UUID }>
```

## `query.observe(observer: (change: Change) => void)`

Pass a function to observe changes to the query's result.

### Example

<!---QueryObserve-->

```typescript
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
}
    
titles.observe(titlesObserver)
    
const rowId = songsTable.insert({ title: 'Give Life Back to Music', genre: 'pop' })

/*
`titlesObserver` prints:
{
    "kind": "add",
    "row": { "id": "\u0006=÷FzÖÁ`", "title": "Give Life Back to Music" },
    "newIndex": 0,
    "type": "add"
}
*/

songsTable.update(rowId, 'genre', 'electronic')
// `titlesObserver` does not run, since we are not observing the genre
```

As shown above, you can use the `QueryChange` utility type to get the type of a query's `Change`.

Queries that return rows have the following change type:

<!---QueryChange-->

```typescript
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
```

For row queries that use `groupBy`, their changes are the same as above but include a `group` parameter.

### Example

<!---QueryObserveGroupBy-->

```typescript
const byGenre = songsTable.query({ 
    groupBy: 'genre',
    sort: (a, b) => b.title.localeCompare(a.title) // Reverse alphabetical order
})

byGenre.observe(change => {
    console.log(change)
})

// `rowId` is the row of 'Give Life Back to Music' inserted above
songsTable.update(rowId, 'genre', 'pop')

/*
byGenre observer logs three changes.

First, the song is removed from the 'electronic' group:
{
    "change": {
        "kind": "remove",
        "oldIndex": 0,
        "row": {
            "genre": "pop",
            "id": "\u0006=÷FzÖÁ`",
            "title": "Give Life Back to Music"
        },
        "type": "update"
    },
    "group": "electronic",
    "kind": "subquery",
    "result": [  ],
    "type": "update"
}

Then, the electronic group is removed, as it no longer has any entries:
{
    "group": "electronic",
    "kind": "removeGroup",
    "result": [  ],
    "type": "update"
}

Finally, a new 'pop' group is created with the song:
{
    "group": "pop",
    "kind": "addGroup",
    "result": [
        {
            "genre": "pop",
            "id": "\u0006=÷FzÖÁ`",
            "title": "Give Life Back to Music"
        }
    ],
    "type": "update"
}

`titlesObserver` does not log, because no titles were changed
*/
```

### Example

<!---QueryObserveGroupBy2-->

```typescript
songsTable.insert({ title: 'Beat It', genre: 'pop' })

/*
`titlesObserver` prints:
{
    "kind": "add",
    "row": { "id": "®\u0003\u0004GÁ", "title": "Beat It" },
    "newIndex": 0,
    "type": "add"
}

byGenre observer logs:
{
    "change": {
        "kind": "add",
        "row": {
            "id": "®\u0003\u0004GÁ",
            "title": "Beat It",
            "genre": "pop"
        },
        "newIndex": 1,
        "type": "add"
    },
    "group": "pop"
}
*/
// Change title of 'Give Life Back to Music'
songsTable.update(titles.result[1].id, 'title', 'Around the World')

/*
`titlesObserver` logs:
{
    "kind": "update",
    "row": { "id": "\u0006=÷FzÖÁ`", "title": "Around the World" },
    "oldIndex": 1,
    "newIndex": 0,
    "oldValues": { "title": "Give Life Back to Music" },
    "type": "update"
}

byGenre observer logs:
{
    "change": {
        "kind": "update",
        "row": {
            "id": "\u0006=÷FzÖÁ`",
            "title": "Around the World",
            "genre": "pop"
        },
        "oldIndex": 0,
        "newIndex": 1,
        "oldValues": { "title": "Give Life Back to Music" }
    },
    "type": "update",
    "group": "pop"
}
*/
```

For `count` queries without a group, the `Change` is simply either `1` or `-1`.

`count` queries with a `groupBy` take the following format:

<!---GroupedCountChange-->

```typescript
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
```

### Example

<!---CountObserve-->

```typescript
const popSongs = songsTable.count({ filter: { genre: 'pop' }})
const genreCounts = songsTable.count({ groupBy: 'genre' })

popSongs.observe(change => console.log(change))
genreCounts.observe(change => console.log(change))

// Remove 'Around the World'
songsTable.delete(titles.result[0].id)

/*
`titlesObserver` logs:
{
    "kind": "remove",
    "row": { "id": "\u0006=÷FzÖÁ`", "title": "Around the World" },
    "oldIndex": 0,
    "type": "delete"
}

byGenre observer logs:
{
    "change": {
        "kind": "remove",
        "row": {
            "id": "\u0006=÷FzÖÁ`",
            "title": "Around the World",
            "genre": "pop"
        },
        "oldIndex": 1
    },
    "type": "delete",
    "group": "pop"
}

popSongs observer logs: { "delta": -1, "type": "delete" }

genreCounts observer logs: {
    "kind": "subquery",
    "group": "pop",
    "change": { "delta": -1, "type": "delete" }
}
*/
```

## `query.unobserve(observer: (change: Change) => void)`

Used to stop an observer from getting more changes.

You must pass the same function that was passed to `observe`.

### Example

<!---Unobserve-->

```typescript
titles.unobserve(titlesObserver)
songsTable.insert({ title: 'Xtal', genre: 'electronic' })

/*
`titlesObserver` is not called

byGenre observer logs:
{
    "kind": "addGroup",
    "result": [
        {
            "genre": "electronic",
            "id": "\u001aA9\u0006)Ö\u0015",
            "title": "Xtal"
        }
    ],
    "type": "add",
    "group": "electronic"
}

popSongs observer is not called

genreCounts observer logs: { "group": "electronic", "kind": "addGroup", "result": 1, "type": "add" }
*/
```

## On Observation Order and Consistency

When changes are made to a table, all observers are called **after** all changes in the Y.js transaction are complete.

This ensures that when each query's observers are called, all observers of all queries have a consistent view of the table.

If you access Query A's result from Query B's observer, Query A's result will already be up-to-date with the latest changes, even if Query A's observers haven't been called yet.

You should expect no other guarantees of observer execution order.

### Example

<!---Observer Ordering-->

```typescript
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
```

Note that even though one of the observers hasn't been called yet when the first observer fires, the result is still consistent.
