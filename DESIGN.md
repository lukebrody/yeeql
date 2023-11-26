# Design for yeeql ~~2.0~~ 1.1

## API Changes

- ~~Introduce `query` independent of tables to do joins.~~
- Introduce a `join` query field, that takes a function that generates a query for the returned row.
    - The query cache means that this will often be the same query.
    - Filtering on the parent query remains on the parent query, since joining and filtering is executed on the child query.
    - Sorting happens on the whole result. (There maybe be cases where the child sorting has some effect, e.g. on grouped subqueries.)

Pre-change: Remove rows (in reverse order, to preserve indices)
Post-change: Add back rows (in forward order, to preserve indices)
Send notifications of row movement

How to get pre-result??? Send the change down

TODO: Filter by subqueries?