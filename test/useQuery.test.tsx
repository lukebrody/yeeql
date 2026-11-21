import { UUID, Field, Table, useQuery } from 'index'
import * as Y from 'yjs'

import { beforeEach, test } from 'node:test'
import assert from 'assert/strict'
import React, { useLayoutEffect, useState } from 'react'
import { render, screen, act } from '@testing-library/react'

const child = {
	id: new Field<UUID>(),
	parentId: new Field<UUID>(),
	order: new Field<number>(),
}

const parent = {
	id: new Field<UUID>(),
	order: new Field<number>(),
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
	children = new Table(yChildren, child, 'children')
	parents = new Table(yParents, parent, 'parents')
})

function List(): React.ReactNode {
	const result = useQuery(
		() =>
			parents.query({
				subqueries: {
					children: (parent) =>
						children.query({
							filter: { parentId: parent.id },
							sort: (a, b) => a.order - b.order,
						}),
				},
				sort: (a, b) => a.order - b.order,
			}),
		[],
	)
	return (
		<>
			{result.map((parent) => (
				<Parent key={parent.id} {...parent} />
			))}
			<ChangeCounter
				queryGenerator={() =>
					children.query({
						sort: (a, b) => a.order - b.order,
					})
				}
			/>
		</>
	)
}

function Parent(parent: {
	id: UUID
	order: number
	children?: ReadonlyArray<
		Readonly<{ id: UUID; parentId: UUID; order: number }>
	>
}): React.ReactNode {
	return (
		<div className="parent" data-testid={parent.id}>
			{parent.children?.map((child) => <Child key={child.id} {...child} />)}
		</div>
	)
}

const Child = React.memo(function Child(child: {
	id: UUID
	parentId: UUID
	order: number
}): React.ReactNode {
	const result = useQuery(
		() =>
			parents.query({
				filter: { id: child.parentId },
				sort: (a, b) => b.order - a.order,
			}),
		[],
	)
	return (
		<div className="child" data-testid={child.id}>
			{result.map((parent) => (
				<Parent key={parent.id} {...parent} />
			))}
		</div>
	)
})

function ChangeCounter({
	queryGenerator,
}: {
	queryGenerator: Parameters<typeof useQuery>[0]
}): React.ReactNode {
	const [updates, setUpdates] = useState(0)
	useQuery(queryGenerator, [queryGenerator], () =>
		setUpdates((updates) => updates + 1),
	)
	return <div data-testid="updates">{updates} Updates</div>
}

test('add parent, children, then re-order', () => {
	const { container } = render(<List />)

	assert.equal(container.getElementsByClassName('parent').length, 0)

	let parentId: UUID
	act(() => (parentId = parents.insert({ order: 0 })))

	const parentElems = () => container.getElementsByClassName('parent')
	assert.equal(parentElems().length, 1)

	let child1Id: UUID | undefined
	act(() => (child1Id = children.insert({ parentId: parentId, order: 0 })))

	const childElems = () => parentElems()[0].getElementsByClassName('child')

	assert.equal(childElems().length, 1)

	let child2Id: UUID | undefined
	act(() => (child2Id = children.insert({ parentId: parentId, order: 1 })))

	const childIds = () =>
		Array.from(childElems()).map(
			(childElem) => childElem.getAttribute('data-testid')!,
		)

	assert.deepEqual(childIds(), [child1Id, child2Id])

	act(() => {
		doc.transact(() => {
			children.update(child1Id!, 'order', 1)
			children.update(child2Id!, 'order', 0)
		})
	})

	assert.deepEqual(childIds(), [child2Id, child1Id])

	assert.equal(screen.getByTestId('updates').textContent, '4 Updates')
})

test('changes before the subscription effect still render', () => {
	function InsertOnMount(): React.ReactNode {
		useLayoutEffect(() => {
			parents.insert({ order: 0 })
		}, [])
		return null
	}

	function Count(): React.ReactNode {
		const count = useQuery(() => parents.count({}), [])
		return (
			<>
				<div data-testid="count">{count}</div>
				<InsertOnMount />
			</>
		)
	}

	render(<Count />)
	assert.equal(screen.getByTestId('count').textContent, '1')
})

test('an invalid query reaches an error boundary', (t) => {
	const originalQueueMicrotask = queueMicrotask
	const reports: unknown[] = []
	t.mock.method(globalThis, 'queueMicrotask', (callback: () => void) =>
		originalQueueMicrotask(() => {
			try {
				callback()
			} catch (error) {
				reports.push(error)
			}
		}),
	)
	// React logs the error it passes to the boundary
	t.mock.method(console, 'error', () => undefined)

	class Boundary extends React.Component<
		{ children: React.ReactNode },
		{ error: Error | null }
	> {
		state: { error: Error | null } = { error: null }
		static getDerivedStateFromError(error: Error) {
			return { error }
		}
		render() {
			const { error } = this.state
			return error ? (
				<div>
					{error.message}: {String(error.cause)}
				</div>
			) : (
				this.props.children
			)
		}
	}

	function Parents(): React.ReactNode {
		const result = useQuery(
			() =>
				parents.query({
					sort: (a, b) => {
						if (a.order < 0 || b.order < 0) {
							throw new Error('negative order')
						}
						return a.order - b.order
					},
				}),
			[],
		)
		return <div>{result.length}</div>
	}

	const { container } = render(
		<Boundary>
			<Parents />
		</Boundary>,
	)
	act(() => {
		parents.insert({ order: 0 })
	})
	assert.equal(container.textContent, '1')
	act(() => {
		parents.insert({ order: -1 })
	})
	assert.equal(
		container.textContent,
		'the sort comparator threw: Error: negative order',
	)
})
