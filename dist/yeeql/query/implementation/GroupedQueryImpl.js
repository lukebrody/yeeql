import { QueryBase, } from '../../../yeeql/query/QueryBase';
export class GroupedQueryImpl extends QueryBase {
    constructor(items, filter, groupBy, makeSubquery) {
        super();
        this.filter = filter;
        this.groupBy = groupBy;
        this.makeSubquery = makeSubquery;
        this.queries = new Map();
        const queries = this.queries;
        this.result = {
            get: (group) => (queries.get(group)?.query.result ??
                makeSubquery(group).result),
            forEach(callbackfn, thisArg) {
                queries.forEach(({ query }, group) => callbackfn.bind(thisArg)(query.result, group, this));
            },
            has: (group) => queries.has(group),
            get size() {
                return queries.size;
            },
            entries() {
                const iterator = queries.entries();
                return {
                    [Symbol.iterator]: () => this.entries(),
                    next() {
                        const { value, done } = iterator.next();
                        if (done === true) {
                            return { value: undefined, done: true };
                        }
                        else {
                            return { value: [value[0], value[1].query.result], done: false };
                        }
                    },
                };
            },
            keys: () => queries.keys(),
            values() {
                const iterator = queries.values();
                return {
                    [Symbol.iterator]: () => this.values(),
                    next() {
                        const { value, done } = iterator.next();
                        return { value: value?.query.result, done };
                    },
                };
            },
            [Symbol.iterator]: function () {
                return this.entries();
            },
        };
        this.select = new Set([groupBy]);
        addItem: for (const [, row] of items) {
            for (const [key, value] of Object.entries(filter)) {
                if (row[key] !== value) {
                    continue addItem;
                }
            }
            const group = row[groupBy];
            const query = this.queries.get(group);
            if (!query) {
                this.addQuery(group);
            }
            else {
                query.refCount++;
            }
        }
    }
    addQuery(group) {
        const query = this.makeSubquery(group);
        const observer = (ready) => {
            return this.notifyingObservers(() => {
                const change = ready();
                return {
                    kind: 'subquery',
                    result: query.result,
                    group,
                    change,
                    type: change.type,
                };
            });
        };
        query.internalObserve(observer);
        this.queries.set(group, { query, refCount: 1, observer });
        return query;
    }
    addRow(row, type) {
        const group = row[this.groupBy];
        const query = this.queries.get(group);
        if (query) {
            query.refCount++;
            return () => undefined;
        }
        else {
            return this.notifyingObservers(() => {
                const query = this.addQuery(group);
                return {
                    kind: 'addGroup',
                    group,
                    type,
                    result: query.result,
                };
            });
        }
    }
    removeRow(row, type) {
        const group = row[this.groupBy];
        const query = this.queries.get(group);
        if (query.refCount === 1) {
            return this.notifyingObservers(() => {
                query.query.internalUnobserve(query.observer);
                this.queries.delete(group);
                return {
                    kind: 'removeGroup',
                    group,
                    result: query.query.result,
                    type,
                };
            });
        }
        else {
            query.refCount--;
            return () => undefined;
        }
    }
    changeRow(row, oldValues, newValues, patch) {
        if (oldValues[this.groupBy] === newValues[this.groupBy]) {
            return () => undefined;
        }
        const removeResult = this.removeRow(row, 'update');
        patch(row);
        const addResult = this.addRow(row, 'update');
        return () => {
            removeResult();
            addResult();
        };
    }
}
