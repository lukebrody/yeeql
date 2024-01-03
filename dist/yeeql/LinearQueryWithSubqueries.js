import { insertOrdered, removeOrdered } from '../common/array';
import { QueryBase } from './QueryBase';
import { debug } from './debug';
export class LinearQueryWithSubqueriesImpl extends QueryBase {
    constructor(items, select, filter, sort, subQueries, subqueryDependencies) {
        super();
        this.filter = filter;
        this.sort = sort;
        this.subQueries = subQueries;
        this.subqueryDependencies = subqueryDependencies;
        this.rowMap = new Map();
        this.result = [];
        addItem: for (const [, row] of items) {
            for (const [key, value] of Object.entries(filter)) {
                if (row[key] !== value) {
                    continue addItem;
                }
            }
            this.addRow(row, 'add');
        }
        this.select = new Set(select);
    }
    addRow(row, type) {
        const subQueries = {};
        const augmentedRow = new Proxy(row, {
            get(row, p) {
                if (p in subQueries && String(p) !== 'constructor') {
                    return subQueries[p].query.result;
                }
                return row[p];
            },
            ownKeys(row) {
                return Reflect.ownKeys(row).concat(Reflect.ownKeys(subQueries));
            },
            getOwnPropertyDescriptor(row, p) {
                if (p in subQueries && String(p) !== 'constructor') {
                    return {
                        configurable: true,
                        enumerable: true,
                        value: subQueries[p].query.result,
                    };
                }
                return Reflect.getOwnPropertyDescriptor(row, p);
            },
        });
        this.rowMap.set(row, {
            augmentedRow,
            subQueries,
        });
        for (const [key, makeQuery] of Object.entries(this.subQueries)) {
            debug.makingSubquery = true;
            const query = makeQuery(row);
            debug.makingSubquery = false;
            const callback = this.makeInternalCallback(key, augmentedRow);
            query.internalObserve(callback);
            subQueries[key] = { query, callback };
        }
        return this.makeChange(() => {
            const addedIndex = insertOrdered(this.result, augmentedRow, this.sort);
            return {
                kind: 'add',
                row: this.rowMap.get(row).augmentedRow,
                newIndex: addedIndex,
                type,
            };
        });
    }
    makeInternalCallback(key, augmentedRow) {
        return (ready) => {
            return this.makeChange(() => {
                const removedIndex = removeOrdered(this.result, augmentedRow, this.sort).index;
                const change = ready();
                const insertedIndex = insertOrdered(this.result, augmentedRow, this.sort);
                return {
                    kind: 'subquery',
                    row: augmentedRow,
                    oldIndex: removedIndex,
                    newIndex: insertedIndex,
                    subChange: { key, change },
                    type: 'update',
                };
            });
        };
    }
    removeRow(row, type) {
        return this.makeChange(() => {
            const { augmentedRow, subQueries } = this.rowMap.get(row);
            for (const [, { query, callback }] of Object.entries(subQueries)) {
                query.unobserve(callback);
            }
            this.rowMap.delete(row);
            const removedIndex = removeOrdered(this.result, augmentedRow, this.sort).index;
            return {
                kind: 'remove',
                row: augmentedRow,
                oldIndex: removedIndex,
                type,
            };
        });
    }
    changeRow(row, oldValues, newValues, patch) {
        return this.makeChange(() => {
            const { augmentedRow, subQueries } = this.rowMap.get(row);
            const removedIndex = removeOrdered(this.result, augmentedRow, this.sort).index;
            patch(row);
            const subqueriesToUpdate = new Set();
            for (const updatedColumn of Object.keys(newValues)) {
                for (const subqueryKey of this.subqueryDependencies.get(updatedColumn)) {
                    subqueriesToUpdate.add(subqueryKey);
                }
            }
            updateQuery: for (const key of subqueriesToUpdate) {
                const makeQuery = this.subQueries[key];
                debug.makingSubquery = true;
                const query = makeQuery(row);
                debug.makingSubquery = false;
                const { query: oldQuery, callback: oldCallback } = subQueries[key];
                if (query === oldQuery) {
                    continue updateQuery;
                }
                oldQuery.internalUnobserve(oldCallback);
                const callback = this.makeInternalCallback(key, augmentedRow);
                query.internalObserve(callback);
                subQueries[key] = {
                    query,
                    callback,
                };
            }
            const addedIndex = insertOrdered(this.result, augmentedRow, this.sort);
            return {
                kind: 'update',
                row: augmentedRow,
                oldIndex: removedIndex,
                newIndex: addedIndex,
                oldValues: oldValues,
                type: 'update',
            };
        });
    }
}
