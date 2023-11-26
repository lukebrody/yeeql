import { UUID } from '../common/UUID'
import { Field } from './Schema'
import { Table } from './Table'
import * as Y from 'yjs'

import { beforeEach, expect, test } from 'vitest'

const child = {
	id: new Field<UUID>(),
	parentId: new Field<UUID>()
}

const parent = {
	id: new Field<UUID>()
}


let doc: Y.Doc
let yChildren: Y.Map<Y.Map<unknown>>
let yParents: Y.Map<Y.Map<unknown>>
let children: Table<typeof child>
let parents: Table<typeof parent>

beforeEach(() => {
	doc = new Y.Doc()
	yChildren = doc.getMap('children') as Y.Map<Y.Map<unknown>>
	yParents = doc.getMap('parents') as Y.Map<Y.Map<unknown>>
	children = new Table(yChildren, child)
	parents = new Table(yParents, parent)
})

test('Table.subqueryRead', () => {
	const parentId = parents.insert({})
	const childId = children.insert({ parentId })

	const query = children.query({ subqueries: {
		parent: (child) => parents.query({ filter: { id: child.parentId }})
	}})

	expect(query.result).toStrictEqual([{ id: childId, parentId, parent: [{ id: parentId }] }])
})