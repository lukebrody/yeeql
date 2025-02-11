# `Query<Result, Change>`

Create a `Query` using `table.query` or `table.count`.

## `query.result: Result`

Contains the result of the query. Automatically updates when the underlying data changes.

You can use the `QueryResult` utility type to get the rersult type from a `Query` type.

### Example

<!---QueryResult-->

```typescript
const query = songsTable.query({ select: ['id'] })

// QueryResult<typeof query> // ReadonlyArray<{ id: UUID }>
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
    {{titlesObserver1}}
    */
songsTable.update(rowId, 'genre', 'electronic')
// `titlesObserver` does not run, since we are not observing the genre
```

As shown above, you can use the `QueryChange` untility type to get the type of a query's `Change`.

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

```

<!---QueryObserveGroupBy2-->

### Example

```typescript
songsTable.insert({ title: 'Beat It', genre: 'pop' })

/*
`titlesObserver` prints:
{
    kind: 'add',
    row: { id: '³:Ø"ÑÝFc', title: 'Beat It' },
    newIndex: 0, // Inserted alphabetically before 'Give Life Back to Music'
    type: 'add'
}
byGenre observer logs:
{
    kind: 'add',
    row: {id: '³:Ø"ÑÝFc', title: 'Beat It', genre: 'pop' },
    newIndex: 1, // Inserted reverse-alphabetically after 'Give Life Back to Music'
    type: 'add',
    group: 'pop'
}
*/

// Change title of 'Give Life Back to Music'
songsTable.update(titles.result[1].id, 'title', 'Around the World')

/*
`titlesObserver` logs:
{
    kind: 'update',
    row: { id: 'éÊ×DQ', title: 'Around the World' },
    oldIndex: 1,
    newIndex: 0, // Has moved before 'Beat It' alphabetically
    oldValues: { title: 'Give Life Back to Music' },
    type: 'update'
}

byGenre observer logs:
{
    kind: 'update',
    row: { id: 'éÊ×DQ', title: 'Around the World', genre: 'pop' },
    oldIndex: 0,
    newIndex: 1, // Has moved reverse-alphabetically after 'Beat It'
    oldValues: { title: 'Give Life Back to Music' },
    type: 'update',
    group: 'pop'
}
*/
```

For `count` queries, without a group, the `Change` is simply either `1` or `-1`.

`count` queries with a `groupBy` take the following format:

<!---GroupedCountChange-->

```typescript

```

### Example

<!---CountObserve-->

```typescript

```

## `query.unobserve(observer: (change: Change) => void)`

Used to stop an observer from getting more changes.

You must pass the same function that was passed to `observe`.

### Example

<!---Unobserve-->

```typescript

```

## On Observation Order and Consistency

When change are made to a table, all observers are called **after** all changes in the Y.js transaction are complete.

This ensures that when each query's observers are called, all observers of all queries have a consistent view of the table.

If you access Query A's result from Query B's observer, Query A's result will already be up-to-date with the latest changes, even if Query A's observers haven't been called yet.

You should expect no other guarantees of observer execution order.

### Example

<!---Observer Ordering-->

```typescript

```

Note that even though one of the observers hasn't been called yet when the first observer fires, the result is still consistent.
