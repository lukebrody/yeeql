/* c8 ignore next */
import { Comparable, Range, rangeBounds } from 'yeeql/table/Schema'

// Bound values split the domain into alternating open intervals and points.
// `segments[2 * i]` is the interval below `points[i]` and `segments[2 * i + 1]` is `points[i]` itself.
export class RangeIndex<T> {
	add(range: Range<Comparable>, item: T) {
		rangeBounds(range).forEach((bound) => this.addPoint(bound))
		const [start, end] = this.segmentSpan(range)
		for (let i = start; i <= end; i++) {
			this.segments[i].add(item)
		}
	}

	delete(range: Range<Comparable>, item: T) {
		const [start, end] = this.segmentSpan(range)
		for (let i = start; i <= end; i++) {
			this.segments[i].delete(item)
		}
		rangeBounds(range).forEach((bound) => this.removePoint(bound))
	}

	get(value: Comparable): ReadonlySet<T> {
		if (Number.isNaN(value)) {
			return new Set()
		}
		const index = this.search(value)
		return this.segments[
			this.points[index] === value ? 2 * index + 1 : 2 * index
		]
	}

	get isEmpty(): boolean {
		return this.points.length === 0
	}

	private readonly points: Comparable[] = []
	private readonly pointRefCounts: number[] = []
	private readonly segments: Set<T>[] = [new Set()]

	// Index of the first point >= `value`
	private search(value: Comparable): number {
		let low = 0
		let high = this.points.length
		while (low < high) {
			const mid = (low + high) >>> 1
			if (this.points[mid] < value) {
				low = mid + 1
			} else {
				high = mid
			}
		}
		return low
	}

	private addPoint(value: Comparable) {
		const index = this.search(value)
		if (this.points[index] === value) {
			this.pointRefCounts[index]++
		} else {
			this.points.splice(index, 0, value)
			this.pointRefCounts.splice(index, 0, 1)
			const interval = this.segments[2 * index]
			this.segments.splice(2 * index, 0, new Set(interval), new Set(interval))
		}
	}

	private removePoint(value: Comparable) {
		const index = this.search(value)
		if (--this.pointRefCounts[index] === 0) {
			this.points.splice(index, 1)
			this.pointRefCounts.splice(index, 1)
			this.segments.splice(2 * index + 1, 2)
		}
	}

	private segmentSpan(range: Range<Comparable>): [number, number] {
		let start = 0
		if (range.gte !== undefined) {
			start = 2 * this.search(range.gte) + 1
		} else if (range.gt !== undefined) {
			start = 2 * this.search(range.gt) + 2
		}
		let end = this.segments.length - 1
		if (range.lte !== undefined) {
			end = 2 * this.search(range.lte) + 1
		} else if (range.lt !== undefined) {
			end = 2 * this.search(range.lt)
		}
		return [start, end]
	}
	/* c8 ignore next */
}
