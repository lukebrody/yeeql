import assert from 'assert/strict'
import { test } from 'node:test'

import { UUID, Field, Table, QueryChange } from 'yeeql'
import * as Y from 'yjs'

test('yeeql Subqueries', () => {
	const doc = new Y.Doc()

	const polygons = new Table(doc.getMap('polygons'), {
		id: new Field<UUID>(),
		color: new Field<
			'red' | 'green' | 'blue' | 'yellow' | 'orange' | 'purple'
		>(),
		depth: new Field<number>(), // Where a lower number means closer to the front
		groupId: new Field<UUID | undefined>(),
	})

	const groups = new Table(doc.getMap('groups'), {
		id: new Field<UUID>(),
		name: new Field<string>(),
		depth: new Field<number>(),
	})

	/**
	 * Here, we're making a drawing app, where the canvas contains an number of polygons.
	 * A polygon can be a member of zero or one groups.
	 */

	/**
	 * Let's have yeeql create a live query whose result is all the polygons, as well as their associated group
	 */

	function sortByDepth(a: { depth: number }, b: { depth: number }): number {
		return a.depth - b.depth
	}

	const polygonsWithGroups = polygons.query({
		subqueries: {
			/**
			 * For each polygon, we make a query that gets its group.
			 * The result of this query is included in its row.
			 */
			group: (polygon) => groups.query({ filter: { id: polygon.groupId } }),
		},
		sort: sortByDepth,
	})

	const primaryColorsGroupId = groups.insert({
		name: 'Primary Colors',
		depth: 1,
	})

	const redPolygonId = polygons.insert({
		color: 'red',
		groupId: primaryColorsGroupId,
		depth: 0,
	})

	assert.deepEqual(polygonsWithGroups.result, [
		{
			id: redPolygonId,
			color: 'red',
			groupId: primaryColorsGroupId,
			/**
			 * See the group query result included in the row
			 */
			group: [
				{
					id: primaryColorsGroupId,
					name: 'Primary Colors',
					depth: 1,
				},
			],
			depth: 0,
		},
	])

	const bluePolygonId = polygons.insert({
		color: 'blue',
		groupId: primaryColorsGroupId,
		depth: 1,
	})

	const greenPolygonId = polygons.insert({
		color: 'green',
		groupId: undefined,
		depth: 2,
	})

	assert.deepEqual(polygonsWithGroups.result, [
		{
			id: redPolygonId,
			color: 'red',
			groupId: primaryColorsGroupId,
			group: [
				{
					id: primaryColorsGroupId,
					name: 'Primary Colors',
					depth: 1,
				},
			],
			depth: 0,
		},
		{
			id: bluePolygonId,
			color: 'blue',
			groupId: primaryColorsGroupId,
			group: [
				{
					id: primaryColorsGroupId,
					name: 'Primary Colors',
					depth: 1,
				},
			],
			depth: 1,
		},
		{
			id: greenPolygonId,
			color: 'green',
			groupId: undefined,
			group: [],
			depth: 2,
		},
	])

	/**
	 * We can also use recursive subqueries.
	 * For example, we can have each group list all of its children.
	 */

	const polygonsWithGroupsWithChildren = polygons.query({
		subqueries: {
			group: (polygon) =>
				groups.query({
					filter: { id: polygon.groupId },
					subqueries: {
						children: (group) =>
							polygons.query({
								filter: { groupId: group.id },
								sort: sortByDepth,
							}),
					},
				}),
		},
		sort: sortByDepth,
	})

	assert.deepEqual(polygonsWithGroupsWithChildren.result, [
		{
			id: redPolygonId,
			color: 'red',
			groupId: primaryColorsGroupId,
			group: [
				{
					id: primaryColorsGroupId,
					name: 'Primary Colors',
					depth: 1,
					children: [
						{
							id: redPolygonId,
							color: 'red',
							groupId: primaryColorsGroupId,
							depth: 0,
						},
						{
							id: bluePolygonId,
							color: 'blue',
							groupId: primaryColorsGroupId,
							depth: 1,
						},
					],
				},
			],
			depth: 0,
		},
		{
			id: bluePolygonId,
			color: 'blue',
			groupId: primaryColorsGroupId,
			group: [
				{
					id: primaryColorsGroupId,
					name: 'Primary Colors',
					depth: 1,
					children: [
						{
							id: redPolygonId,
							color: 'red',
							groupId: primaryColorsGroupId,
							depth: 0,
						},
						{
							id: bluePolygonId,
							color: 'blue',
							groupId: primaryColorsGroupId,
							depth: 1,
						},
					],
				},
			],
			depth: 1,
		},
		{
			id: greenPolygonId,
			color: 'green',
			groupId: undefined,
			group: [],
			depth: 2,
		},
	])

	/**
	 * Performance:
	 *
	 * Subqueries are efficient because they use yeeql's underlying query caching machinery.
	 *
	 * For example, in the query above, the query for the groups of `red` and `blue` is actually the same query.
	 */

	assert(
		polygonsWithGroups.result[0].group === polygonsWithGroups.result[1].group,
	)

	/**
	 * This functionality requires not redefining sort functions, so ensure that you define your sort functions statically
	 * rather than using anonymous functions.
	 *
	 * For more information about query caching, see: Table.md > Query Caching
	 */

	/**
	 * Query changes in subqueries.
	 */

	let changes: QueryChange<typeof polygonsWithGroups>[] = []

	polygonsWithGroups.observe((change) => changes.push(change))

	const yellowPolygonId = polygons.insert({
		color: 'yellow',
		depth: 3,
		groupId: primaryColorsGroupId,
	})

	assert.deepEqual(changes, [
		{
			kind: 'add',
			row: {
				id: yellowPolygonId,
				color: 'yellow',
				depth: 3,
				groupId: primaryColorsGroupId,
				group: [
					{
						id: primaryColorsGroupId,
						name: 'Primary Colors',
						depth: 1,
					},
				],
			},
			newIndex: 3,
			type: 'add',
		},
	])
	changes = []

	const secondaryColorsGroupId = groups.insert({
		name: 'Secondary Colors',
		depth: 0,
	})

	polygons.update(greenPolygonId, 'groupId', secondaryColorsGroupId)

	assert.deepEqual(changes, [
		{
			kind: 'update',
			row: {
				id: greenPolygonId,
				color: 'green',
				depth: 2,
				groupId: secondaryColorsGroupId,
				group: [
					{
						id: secondaryColorsGroupId,
						name: 'Secondary Colors',
						depth: 0,
					},
				],
			},
			oldValues: {
				group: [],
				groupId: undefined,
			},
			newIndex: 2,
			oldIndex: 2,
			type: 'update',
		},
	])

	/**
	 * Note that `oldValues` for subqueries are **by reference**.
	 * This means that subqueries that return an object (e.g. an array), will have the most updated contents, even within the `oldValues`
	 */

	/**
	 * Example with advanced sorting
	 *
	 * Here, we want to have a live query into the total order of the objects on our canvas,
	 * with the `depth` of parent groups taking precedence.
	 */

	function totalOrderSort(
		a: {
			depth: number
			groupId: UUID | undefined
			group: readonly { depth: number }[]
		},
		b: {
			depth: number
			groupId: UUID | undefined
			group: readonly { depth: number }[]
		},
	): number {
		// If a and b are both in the same group or both ungrouped, compare either their depths directly
		if (a.groupId === b.groupId) {
			return a.depth - b.depth
		}

		// If a and b are in different groups, compare the depth of their groups (or their own depth if ungrouped)
		return (a.group[0]?.depth ?? a.depth) - (b.group[0]?.depth ?? b.depth)
	}

	const totalOrderedPolygons = polygons.query({
		subqueries: {
			group: (polygon: { groupId: UUID | undefined }) =>
				groups.query({ filter: { id: polygon.groupId } }),
		},
		sort: totalOrderSort,
	})

	function sceneDescription() {
		return totalOrderedPolygons.result.map(
			({ color, depth, group: [{ name, depth: groupDepth }] }) => ({
				color,
				depth,
				group: { name, depth: groupDepth },
			}),
		)
	}

	assert.deepEqual(sceneDescription(), [
		{
			color: 'green',
			depth: 2,
			group: {
				depth: 0,
				name: 'Secondary Colors',
			},
		},
		{
			color: 'red',
			depth: 0,
			group: {
				depth: 1,
				name: 'Primary Colors',
			},
		},
		{
			color: 'blue',
			depth: 1,
			group: {
				depth: 1,
				name: 'Primary Colors',
			},
		},
		{
			color: 'yellow',
			depth: 3,
			group: {
				depth: 1,
				name: 'Primary Colors',
			},
		},
	])

	groups.update(secondaryColorsGroupId, 'depth', 2)

	assert.deepEqual(sceneDescription(), [
		{
			color: 'red',
			depth: 0,
			group: {
				depth: 1,
				name: 'Primary Colors',
			},
		},
		{
			color: 'blue',
			depth: 1,
			group: {
				depth: 1,
				name: 'Primary Colors',
			},
		},
		{
			color: 'yellow',
			depth: 3,
			group: {
				depth: 1,
				name: 'Primary Colors',
			},
		},
		{
			color: 'green',
			depth: 2,
			group: {
				depth: 2,
				name: 'Secondary Colors',
			},
		},
	])
})
