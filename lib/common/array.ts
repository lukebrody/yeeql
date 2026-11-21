/* c8 ignore next */
import { reportUserError } from 'yeeql/table/Schema'

function findIndex<T, I>(
	sortedArray: readonly T[],
	item: I,
	comparator: (a: I, b: T) => number,
): number {
	let low = 0
	let high = sortedArray.length
	while (low < high) {
		const mid = Math.floor((low + high) / 2)
		if (comparator(item, sortedArray[mid]) > 0) {
			low = mid + 1
		} else {
			high = mid
		}
	}
	return low
}

export function getOrderedIndex<T, I>(
	sortedArray: readonly T[],
	item: I,
	comparator: (a: I, b: T) => number,
): number | undefined {
	const index = findIndex(sortedArray, item, comparator)
	if (
		index < sortedArray.length &&
		comparator(item, sortedArray[index]) === 0
	) {
		return index
	}
}

export function insertOrdered<T>(
	sortedArray: T[],
	newItem: T,
	comparator: (a: T, b: T) => number,
): number {
	const index = findIndex(sortedArray, newItem, comparator)
	sortedArray.splice(index, 0, newItem)
	return index
}

// A sort is user code, so if it throws, report that and search linearly
/* c8 ignore next */
export function findOrdered<T>(
	sortedArray: readonly T[],
	item: T,
	comparator: (a: T, b: T) => number,
): number {
	try {
		return getOrderedIndex(sortedArray, item, comparator)!
	} catch (error) {
		reportUserError(error)
		return sortedArray.indexOf(item)
	}
}
