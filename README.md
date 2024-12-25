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

```

### Inserting Rows

<!---Insert-->

```typescript

```

### Selecting Rows

<!---Select-->

```typescript

```

### Observing Changes

<!---Observe-->

```typescript

```

### Updating Rows

<!---Update-->

```typescript

```

### Deleting Rows

<!---Delete-->

```typescript

```

## React hook

<!---React Hook-->

```typescript

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

```

Note how the `genusSort` function is the same instance. Prefer using common instances for each type of `sort` function you use. This way yeeql can more effectively re-use queries, since it knows the `sort` function is the same.

## No Copying

Once a row is constructed from the `Y.Table`, it is reused across all queries. Each query maintains its result using these rows. The query result is not copied on access, so if you reference a query's `result`, that array will change as the query's result changes.

# Future Work

- Non-literal (Less Than, Greater Than) filter parameters. (Should be possible using a datastructure that maps segments of a domain to different values.)
- `LIMIT` and `OFFSET` equivalents.
- Option to validate rows and only include rows from peers with a correct schema.
