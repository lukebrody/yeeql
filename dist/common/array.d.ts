export declare function getOrderedIndex<T, I>(sortedArray: readonly T[], item: I, comparator: (a: I, b: T) => number): number | undefined;
export declare function insertOrdered<T>(sortedArray: T[], newItem: T, comparator: (a: T, b: T) => number): number;
export declare function removeOrdered<T, I>(sortedArray: T[], item: I, comparator: (a: I, b: T) => number): {
    index: number;
    item: T;
} | undefined;
