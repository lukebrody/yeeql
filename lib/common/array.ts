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

export function removeOrdered<T, I>(
	sortedArray: T[],
	item: I,
	comparator: (a: I, b: T) => number,
): { index: number; item: T } | undefined {
	const index = getOrderedIndex(sortedArray, item, comparator)
	if (index !== undefined && comparator(item, sortedArray[index]) === 0) {
		return {
			index,
			item: sortedArray.splice(index, 1)[0],
		}
	}
}
