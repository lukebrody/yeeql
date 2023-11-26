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

test('Table.subqueryUpdate', () => {
	const query = children.query({ subqueries: {
		parent: (child) => parents.query({ filter: { id: child.parentId }})
	}})

	const parentId = parents.insert({})
	const wrongId = UUID.create()
	const childId = children.insert({ parentId: wrongId })

	expect(query.result).toStrictEqual([{ id: childId, parentId: wrongId, parent: [] }])

	children.update(childId, 'parentId', parentId)

	expect(query.result).toStrictEqual([{ id: childId, parentId, parent: [{ id: parentId }] }])

	expect(query.result[0].parent[0].id).toBe(parentId) // Type checking
	expect(query.result[0].id).toBe(childId) // Type checking
	expect(query.result[0].parentId).toBe(parentId) // Type checking
})

test('Table.subquerySort', () => {
	const query = parents.query({ 
		subqueries: {
			children: (parent) => children.query({ filter: { parentId: parent.id } })
		},
		sort: (a, b) => a.children.length - b.children.length
	})
	
	const parentA = parents.insert({})
	const parentB = parents.insert({})
    
	const child1 = children.insert({ parentId: parentA })

	expect(query.result).toStrictEqual([{ id: parentB, children: [] }, { id: parentA, children: [{ id: child1, parentId: parentA }] }])
})