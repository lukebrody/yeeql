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

// `entries` is sorted by lower bound, so the entries whose lower bound admits a value are a prefix.
// `maxUpper` is a segment tree over `entries` holding the index of the highest upper bound in each node.
export class RangeIndex<T> {
	add(range: Range<Comparable>, item: T) {
		if (rangeBounds(range).some(Number.isNaN)) {
			return
		}
		const index = this.firstIndex(
			(entry) => compareLower(entry.range, range) > 0,
		)
		this.entries.splice(index, 0, { range, item })
		this.maxUpperStale = true
	}

	delete(range: Range<Comparable>, item: T) {
		if (rangeBounds(range).some(Number.isNaN)) {
			return
		}
		this.entries.splice(
			this.entries.findIndex((entry) => entry.item === item),
			1,
		)
		this.maxUpperStale = true
	}

	get(value: Comparable): ReadonlySet<T> {
		const result = new Set<T>()
		if (Number.isNaN(value)) {
			return result
		}
		if (this.maxUpperStale) {
			this.buildMaxUpper(1, 0, this.entries.length)
			this.maxUpperStale = false
		}
		const count = this.firstIndex((entry) => !admitsLower(entry.range, value))
		this.collect(1, 0, this.entries.length, count, value, result)
		return result
	}

	get isEmpty(): boolean {
		return this.entries.length === 0
	}

	private readonly entries: { range: Range<Comparable>; item: T }[] = []
	private readonly maxUpper: number[] = []
	private maxUpperStale = false

	// Index of the first entry matching `predicate`, which must be false then true across `entries`
	private firstIndex(
		predicate: (entry: { range: Range<Comparable>; item: T }) => boolean,
	): number {
		let low = 0
		let high = this.entries.length
		while (low < high) {
			const mid = (low + high) >>> 1
			if (predicate(this.entries[mid])) {
				high = mid
			} else {
				low = mid + 1
			}
		}
		return low
	}

	private buildMaxUpper(node: number, low: number, high: number) {
		if (high - low <= 1) {
			this.maxUpper[node] = low
			return
		}
		const mid = (low + high) >>> 1
		this.buildMaxUpper(2 * node, low, mid)
		this.buildMaxUpper(2 * node + 1, mid, high)
		const left = this.maxUpper[2 * node]
		const right = this.maxUpper[2 * node + 1]
		this.maxUpper[node] =
			compareUpper(this.entries[left].range, this.entries[right].range) >= 0
				? left
				: right
	}

	// Adds entries in `[low, high)` before `count` whose upper bound admits `value`
	private collect(
		node: number,
		low: number,
		high: number,
		count: number,
		value: Comparable,
		result: Set<T>,
	) {
		if (
			low >= count ||
			!admitsUpper(this.entries[this.maxUpper[node]].range, value)
		) {
			return
		}
		if (high - low === 1) {
			result.add(this.entries[low].item)
			return
		}
		const mid = (low + high) >>> 1
		this.collect(2 * node, low, mid, count, value, result)
		this.collect(2 * node + 1, mid, high, count, value, result)
	}
	/* c8 ignore next */
}
