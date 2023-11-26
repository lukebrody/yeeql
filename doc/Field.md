# `Field`

`Field` is a simple class that helps you define schemas for your table.

It only has a constructor.

### Example of `Field` usage

```typescript
import { Field } from 'yeeql'

// Define your schema
const schema = {
    id: new Field<UUID>(), // Table schemas must include an `id` column with type `UUID`
    isCompleted: new Field<boolean>()
    text: new Field<Y.Text>() // Using Y data types is supported. You cannot `filter` or `sort` using them.
    info: new Field<'a' | 0 | undefined>() // Various unions are supported
}
```

Only the columns extending the Javascript primitive types can be used for `filter`, `sort`, and `groupBy`. This is because:

- yeeql does not monitor Y data types or other objects for deep changes.
- Objects and Y data types are not generally equatable, especially different instances created over the network.

## `new Field<Type>()`

In a schema, indicates a column value of `Type`.

Only fields whose type extends `string`, `number`, `boolean`, `undefined`, or `null` can be used for sorting, filtering, and grouping. (You can also use `bigint`, although that might not work well with Y.js)
