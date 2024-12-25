function findIndex(sortedArray, item, comparator) {
    let low = 0;
    let high = sortedArray.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (comparator(item, sortedArray[mid]) > 0) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
export function getOrderedIndex(sortedArray, item, comparator) {
    const index = findIndex(sortedArray, item, comparator);
    if (index < sortedArray.length &&
        comparator(item, sortedArray[index]) === 0) {
        return index;
    }
}
export function insertOrdered(sortedArray, newItem, comparator) {
    const index = findIndex(sortedArray, newItem, comparator);
    sortedArray.splice(index, 0, newItem);
    return index;
}
export function removeOrdered(sortedArray, item, comparator) {
    const index = getOrderedIndex(sortedArray, item, comparator);
    if (index !== undefined && comparator(item, sortedArray[index]) === 0) {
        return {
            index,
            item: sortedArray.splice(index, 1)[0],
        };
    }
}
