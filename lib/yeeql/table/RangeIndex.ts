/* c8 ignore next */
import { Comparable, Range, rangeBounds } from 'yeeql/table/Schema'

function admitsLower(range: Range<Comparable>, value: Comparable): boolean {
	return (
		(range.gt === undefined || value > range.gt) &&
		(range.gte === undefined || value >= range.gte)
	)
}

function admitsUpper(range: Range<Comparable>, value: Comparable): boolean {
	return (
		(range.lt === undefined || value < range.lt) &&
		(range.lte === undefined || value <= range.lte)
	)
}

// Unbounded first, then by value, with `gte` before `gt`
function compareLower(a: Range<Comparable>, b: Range<Comparable>): number {
	const aValue = a.gt ?? a.gte
	const bValue = b.gt ?? b.gte
	if (aValue === undefined || bValue === undefined) {
		return Number(aValue !== undefined) - Number(bValue !== undefined)
	}
	if (aValue !== bValue) {
		return aValue < bValue ? -1 : 1
	}
	return Number(a.gt !== undefined) - Number(b.gt !== undefined)
}

// By value with `lt` before `lte`, then unbounded last
function compareUpper(a: Range<Comparable>, b: Range<Comparable>): number {
	const aValue = a.lt ?? a.lte
	const bValue = b.lt ?? b.lte
	if (aValue === undefined || bValue === undefined) {
		return Number(aValue === undefined) - Number(bValue === undefined)
	}
	if (aValue !== bValue) {
		return aValue < bValue ? -1 : 1
	}
	return Number(a.lte !== undefined) - Number(b.lte !== undefined)
}

type TreapNode<T> = {
	range: Range<Comparable>
	item: T
	priority: number
	left: TreapNode<T> | undefined
	right: TreapNode<T> | undefined
	// The highest upper bound in this subtree
	maxUpper: Range<Comparable>
}

function update<T>(node: TreapNode<T>) {
	node.maxUpper = node.range
	if (node.left && compareUpper(node.left.maxUpper, node.maxUpper) > 0) {
		node.maxUpper = node.left.maxUpper
	}
	if (node.right && compareUpper(node.right.maxUpper, node.maxUpper) > 0) {
		node.maxUpper = node.right.maxUpper
	}
}

function split<T>(
	node: TreapNode<T> | undefined,
	goesLeft: (range: Range<Comparable>) => boolean,
): [TreapNode<T> | undefined, TreapNode<T> | undefined] {
	if (!node) {
		return [undefined, undefined]
	}
	if (goesLeft(node.range)) {
		const [left, right] = split(node.right, goesLeft)
		node.right = left
		update(node)
		return [node, right]
	} else {
		const [left, right] = split(node.left, goesLeft)
		node.left = right
		update(node)
		return [left, node]
	}
}

function merge<T>(
	left: TreapNode<T> | undefined,
	right: TreapNode<T> | undefined,
): TreapNode<T> | undefined {
	if (!left || !right) {
		return left ?? right
	}
	if (left.priority > right.priority) {
		left.right = merge(left.right, right)
		update(left)
		return left
	} else {
		right.left = merge(left, right.left)
		update(right)
		return right
	}
}

function removeItem<T>(
	node: TreapNode<T> | undefined,
	item: T,
): TreapNode<T> | undefined {
	if (!node) {
		return undefined
	}
	if (node.item === item) {
		return merge(node.left, node.right)
	}
	node.left = removeItem(node.left, item)
	node.right = removeItem(node.right, item)
	update(node)
	return node
}

function collect<T>(
	node: TreapNode<T> | undefined,
	value: Comparable,
	result: Set<T>,
) {
	if (!node || !admitsUpper(node.maxUpper, value)) {
		return
	}
	collect(node.left, value, result)
	// The right subtree's lower bounds are no lower than this one's
	if (!admitsLower(node.range, value)) {
		return
	}
	if (admitsUpper(node.range, value)) {
		result.add(node.item)
	}
	collect(node.right, value, result)
}

function compareRanges(a: Range<Comparable>, b: Range<Comparable>): number {
	return compareLower(a, b) || compareUpper(a, b)
}

// A treap ordered by lower bound, where each node tracks its subtree's highest upper bound
export class RangeIndex<T> {
	add(range: Range<Comparable>, item: T) {
		if (rangeBounds(range).some(Number.isNaN)) {
			return
		}
		const node: TreapNode<T> = {
			range,
			item,
			priority: Math.random(),
			left: undefined,
			right: undefined,
			maxUpper: range,
		}
		const [left, right] = split(
			this.root,
			(other) => compareRanges(other, range) <= 0,
		)
		this.root = merge(merge(left, node), right)
	}

	delete(range: Range<Comparable>, item: T) {
		if (rangeBounds(range).some(Number.isNaN)) {
			return
		}
		const [left, rest] = split(
			this.root,
			(other) => compareRanges(other, range) < 0,
		)
		const [equal, right] = split(
			rest,
			(other) => compareRanges(other, range) <= 0,
		)
		this.root = merge(merge(left, removeItem(equal, item)), right)
	}

	get(value: Comparable): ReadonlySet<T> {
		const result = new Set<T>()
		if (!Number.isNaN(value)) {
			collect(this.root, value, result)
		}
		return result
	}

	get isEmpty(): boolean {
		return this.root === undefined
	}

	private root: TreapNode<T> | undefined
	/* c8 ignore next */
}
