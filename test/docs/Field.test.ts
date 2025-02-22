import { UUID } from 'yeeql'
import * as Y from 'yjs'
import test from 'node:test'
// start docs Field
import { Field } from 'yeeql'

// Define your schema
const schema = {
	id: new Field<UUID>(), // Table schemas must include an `id` column with type `UUID`
	isCompleted: new Field<boolean>(),
	text: new Field<Y.Text>(), // Using Y data types is supported. You cannot `filter` or `sort` using them.
	info: new Field<'a' | 0 | undefined>(), // Various unions are supported
}
// end docs Field

test('Field.md', () => {
	schema
})
