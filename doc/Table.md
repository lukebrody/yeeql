# `Table`

The core of yeeql, the `Table` class wraps a Y.js `Y.Map`, and allows you to run and monitor queries on its contents.

## `constructor(yTable: Y.Map<Y.Map<unknown>>, schema: Schema)`

Construct a new `Table` with some `Schema`, based on a `Y.Map`.

### Example of `Table` usage:

<!---Table Setup-->

```typescript
import { Field, Table, UUID } from 'yeeql'
import * as Y from 'yjs'

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
```

You should aim to create only one `Table` per `Y.Map`. While multiple `Table`s with the same schema will work fine together (and in fact do over the network), using multiple `Tables` decreases effeciency, as each table will have to respond to changes. Additionally, you will not be able to take advantage of cached queries.

Additionally, you should avoid creating multiple `Table`s with different schemas on the same `Y.Map`. While this may work in some cases (if the schemas are compatible), it's probably a better idea to define a schema that covers all the columns, and use the `select` feature.

## `table.insert(row): UUID`

Use this method to insert a row into your table.

### Example

<!---Table Insert-->

```typescript
const kaylaId: UUID = scoresTable.insert({
    game: 'pinball',
    playerName: 'Kayla',
    score: 900,
})
```

All fields of the row are required as defined in the schema, except `id`. `insert` generates a new `UUID` for the row, and returns it.

## Notes on table modifications

You can also use `Y` transactions when making modifications to tables.

Modifications to tables are compatible with `Y.UndoManager`

<!---Table Transact-->

```typescript
doc.transact(() => {
    ;[
        { game: 'skeeball' as const, playerName: 'Andreas', score: 800 },
        { game: 'pinball' as const, playerName: 'Maytal', score: 1200 },
        { game: 'skeeball' as const, playerName: 'Tomi', score: 700 },
        { game: 'pinball' as const, playerName: 'Kayla', score: 1000 },
    ].forEach((row) => scoresTable.insert(row))
})
```

Query observers are called after the transaction completes, at the point where observers have a consistent view of every table on the document.

## `table.update(id: UUID, column, value)`

Updates the specified `column` in the row of `id` to a new `value`.

You cannot update `id`.

### Example

<!---Table Update-->

```typescript
scoresTable.update(kaylaId, 'score', 1100)
```

## `table.delete(id: UUID)`

Removes a row with `id` from the table.

If the row does not exist in the table, this methods succeeds without doing anything.

<!---Table Delete-->

```typescript
// Tilt!
scoresTable.delete(kaylaId)
```

## `table.query({ select?, filter?, sort? }): Query`

Gets or creates a query on the `table`.

### Example Usage:

<!---Table Query 1-->

```typescript
const highestPinballScores = scoresTable.query({
    select: ['score'],
    filter: { game: 'pinball' },
    sort: (a, b) => b.score - a.score,
})

highestPinballScores.result // [ { "score": 1200 }, { "score": 1000 } ]
```

## `table.query({ select?, filter?, sort?, groupBy }): Query`

Gets or creates a grouped query on the `table`.

### Example Usage

<!---Table Query 2-->

```typescript
const bestPlayersByGame = scoresTable.query({
    select: ['playerName'],
    sort: (a, b) => b.score - a.score,
    groupBy: 'game',
})

bestPlayersByGame.result.get('skeeball') // [ { "playerName": "Andreas" }, { "playerName": "Tomi" } ]
```

If you `get` a group with no elements, the empty array `[]` is returned.

## `table.query({ subqueries, select?, filter?, sort?, groupBy? }): Query`

Gets or creates a query on the table that uses `subqueries`, which embed another query result in each row.

### Example Usage

<!---Table Query 3-->

```typescript
// If you send a friend request to someone, they should be able to see your score
const friendsTable = new Table(doc.getMap('friends'), {
    id: new Field<UUID>(),
    sender: new Field<string>(),
    reciever: new Field<string>(),
})

// Tomi should be able to see Andreas's score
friendsTable.insert({ sender: 'Andreas', reciever: 'Tomi' })

const competitors = scoresTable.query({
    select: ['playerName', 'score'],
    subqueries: {
        totalGamePlays: (score) =>
            scoresTable.count({
                filter: { playerName: score.playerName, game: score.game },
            }),
        friendScores: (score) =>
            friendsTable.query({
                filter: { reciever: score.playerName },
                select: ['sender'],
                subqueries: {
                    scores: ({ sender }) =>
                        scoresTable.query({
                            select: ['score'],
                            filter: { playerName: sender, game: score.game },
                        }),
                },
            }),
    },
    filter: { playerName: 'Tomi', game: 'skeeball' },
})

competitors.result /* [
    {
        "playerName": "Tomi",
        "score": 700,
        "totalGamePlays": 1,
        "friendScores": [
            { "sender": "Andreas", "scores": [ { "score": 800 } ] }
        ]
    }
] */
```

For more examples of how to use subqueries and more information about subqueries, see the [Subqueries Example File](/test/docs/Subqueries.test.ts)

## `table.count({ filter? }): Query`

Given a `filter`, returns a query whose result is number of rows matching that `filter`.

If no filter is specificed, returns a query whose result is the number of rows in the table.

### Example

<!---Table Count 1-->

```typescript
scoresTable.count({ filter: { game: 'pinball' } }).result // 2
scoresTable.count({}).result // 4
```

## `table.count({ filter?, groupBy }): Query`

Like normal `count`, but splits the counts into groups.

### Example

<!---Table Count 2-->

```typescript
scoresTable.count({ groupBy: 'game' }).result.get('skeeball') // 2
```

## Query Parameters

If you exclude the `select` parameter, the query returns all columns.

If you exclude the `filter` parameter, the query returns all rows.

If you exclude the `sort` parameter, the rows will be sorted by `id`.

Only the columns extending the Javascript primitive types can be used for `filter`, `sort`, and `groupBy`. This is because:

- yeeql does not monitor Y data types or other objects for deep changes.
- Objects and Y data types are not generally equatable, especially different instances created over the network.

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

### Advanced Query Caching

Additionally, `Table` will reuse queries that are functionally equivalent in what columns cause them to change.

For example:

<!---Advanced Query Caching-->

```typescript
const queryC = dinoTable.query({
    select: ['diet'],
    sort,
})

const queryD = dinoTable.query({
    select: ['diet', 'genus'],
    sort,
})

console.log(queryC === queryD) // Prints `true`
```

Even though `queryC` doesn't select the `genus` column, its sort relies on `genus`. Therefore, `queryC` and `queryD` always return the same set of data, and update when the same columns change.
