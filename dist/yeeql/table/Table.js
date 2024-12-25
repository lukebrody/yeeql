import stringify from 'json-stable-stringify';
import * as Y from 'yjs';
import { DefaultMap } from '../../common/DefaultMap';
import { UUID } from '../../common/UUID';
import { debug } from '../../common/debug';
import { compareStrings } from '../../common/string';
import { QueryRegistry, addedOrRemoved, } from '../../yeeql/table/QueryRegistry';
import { schemaToDebugString, } from '../../yeeql/table/Schema';
import { LinearQueryWithoutSubqueriesImpl } from '../../yeeql/query/implementation/LinearQueryWithoutSubqueriesImpl';
import { LinearQueryWithSubqueriesImpl } from '../../yeeql/query/implementation/LinearQueryWithSubqueriesImpl';
import { GroupedQueryImpl } from '../../yeeql/query/implementation/GroupedQueryImpl';
import { CountQueryImpl } from '../../yeeql/query/implementation/CountQueryImpl';
const stubProxy = new Proxy(() => stubProxy, {
    get(_, p) {
        if (p === Symbol.toPrimitive) {
            return () => '0';
        }
        return stubProxy;
    },
});
function getSortColumns(schema, sort, subqueries) {
    const accessedKeys = new Set();
    const proxy = new Proxy({}, {
        get(_, p) {
            if (p in schema) {
                accessedKeys.add(p);
                return '0';
            }
            else if (subqueries !== undefined && p in subqueries) {
                return stubProxy;
            }
            else {
                throw new Error(`unknown column '${p.toString()}' used in 'sort' comparator`);
            }
        },
    });
    sort(proxy, proxy);
    return accessedKeys;
}
function makeSubqueriesProxy(schema) {
    const accessedKeys = new Set();
    const proxy = new Proxy({}, {
        get(_, p) {
            if (p in schema) {
                accessedKeys.add(p);
                return '0';
            }
            else {
                throw new Error(`unknown column '${p.toString()}' used in subquery generator`);
            }
        },
    });
    return { accessedKeys, proxy };
}
function getSubqueriesColumns(schema, subqueries) {
    const { proxy, accessedKeys } = makeSubqueriesProxy(schema);
    if (subqueries) {
        for (const subquery of Object.values(subqueries)) {
            subquery(proxy);
        }
    }
    return accessedKeys;
}
function getSubqueriesDependencies(schema, subqueries) {
    const result = new DefaultMap(() => new Set());
    for (const [subqueryKey, subquery] of Object.entries(subqueries)) {
        const { proxy, accessedKeys } = makeSubqueriesProxy(schema);
        subquery(proxy);
        for (const accessedKey of accessedKeys) {
            result.get(accessedKey).add(subqueryKey);
        }
    }
    return result;
}
const noSort = () => 0;
function makeTiebrokenIdSort(comparator) {
    return (a, b) => {
        const result = comparator(a, b);
        if (result === 0) {
            return compareStrings(a.id, b.id);
        }
        else {
            return result;
        }
    };
}
export class Table {
    constructor(yTable, schema, debugName) {
        this.yTable = yTable;
        this.schema = schema;
        this.queryCache = new DefaultMap(() => new DefaultMap(() => new Map()));
        this.queryFinalizer = new FinalizationRegistry(({ key, sort, subqueries }) => {
            const layerOne = this.queryCache.get(key);
            const layerTwo = layerOne.get(sort);
            layerTwo.delete(subqueries);
            if (layerTwo.size === 0) {
                layerOne.delete(sort);
                if (layerOne.size === 0) {
                    this.queryCache.delete(key);
                }
            }
        });
        this.debugName = debugName ?? `table${++debug.counter}`;
        /* v8 ignore start */
        if (debug.on) {
            debug.statements.push(`const ${this.debugName} = new Table(ydoc.getMap('${this.debugName}'), ${schemaToDebugString(schema)}, '${this.debugName}')`);
        }
        /* v8 ignore stop */
        this.queryRegistry = new QueryRegistry(schema);
        this.items = new Map();
        yTable.forEach((value, key) => {
            this.items.set(key, this.mapValueToRow(key, value));
        });
        yTable.observeDeep((events) => {
            const runAfterTransaction = [];
            for (const event of events) {
                if (event.target === yTable) {
                    for (const [key, { action }] of event.keys) {
                        if (action === 'delete' || action === 'update') {
                            const row = this.items.get(key);
                            this.items.delete(key);
                            const queries = this.queryRegistry.queries(row, addedOrRemoved);
                            queries.forEach((query) => {
                                runAfterTransaction.push(query.removeRow(row, action));
                            });
                        }
                        if (action === 'add' || action === 'update') {
                            const row = this.mapValueToRow(key, yTable.get(key));
                            this.items.set(key, row);
                            const queries = this.queryRegistry.queries(row, addedOrRemoved);
                            queries.forEach((query) => {
                                runAfterTransaction.push(query.addRow(row, action));
                            });
                        }
                    }
                }
                else if (event.target.parent === yTable) {
                    const id = event.path[event.path.length - 1];
                    const row = this.items.get(id);
                    const oldValues = {};
                    const newValues = {};
                    for (const key of event.keys.keys()) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const value = event.target.get(key);
                        oldValues[key] = row[key];
                        newValues[key] = value;
                    }
                    const patch = (row) => Object.entries(newValues).forEach(([key, value]) => (row[key] = value));
                    const unpatch = (row) => Object.entries(oldValues).forEach(([key, value]) => (row[key] = value));
                    // Query `filter` should be a subset of `select` since we're querying on changes, and filter params may have changed
                    const beforeQueries = this.queryRegistry.queries(row, newValues);
                    patch(row);
                    const afterQueries = this.queryRegistry.queries(row, newValues);
                    unpatch(row);
                    for (const beforeQuery of beforeQueries) {
                        if (!afterQueries.has(beforeQuery)) {
                            runAfterTransaction.push(beforeQuery.removeRow(row, 'update'));
                        }
                    }
                    patch(row);
                    for (const afterQuery of afterQueries) {
                        if (!beforeQueries.has(afterQuery)) {
                            runAfterTransaction.push(afterQuery.addRow(row, 'update'));
                        }
                        else {
                            unpatch(row);
                            runAfterTransaction.push(afterQuery.changeRow(row, oldValues, newValues, patch));
                        }
                    }
                }
            }
            yTable.doc.once('afterTransaction', () => {
                runAfterTransaction.forEach((callback) => callback());
            });
        });
    }
    mapValueToRow(id, yMap) {
        const result = { id };
        for (const key of Object.keys(this.schema)) {
            if (key !== 'id') {
                result[key] = yMap.get(key);
            }
        }
        return result;
    }
    getCachedQuery({ key, sort, subqueries }, makeQuery) {
        const cached = this.queryCache.get(key).get(sort).get(subqueries)?.deref();
        if (cached) {
            return cached;
        }
        else {
            const result = makeQuery();
            this.queryCache.get(key).get(sort).set(subqueries, new WeakRef(result));
            this.queryRegistry.register(result);
            this.queryFinalizer.register(result, { key, sort, subqueries });
            return result;
        }
    }
    validateColumns(cols) {
        const uknownCol = cols.find((col) => this.schema[col] === undefined);
        if (uknownCol !== undefined) {
            throw new Error(`unknown column '${uknownCol.toString()}'`);
        }
    }
    query({ filter = {}, select, sort = noSort, groupBy, subqueries, }) {
        /* v8 ignore start */
        if (debug.on && !debug.makingSubquery) {
            let subqueriesString;
            if (subqueries !== undefined) {
                subqueriesString = `{${Object.entries(subqueries)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ')}}`;
            }
            debug.statements.push(`const query${++debug.counter} = ${this.debugName}.query({select: ${select}, filter: ${JSON.stringify(filter)}, subqueries: ${subqueriesString}, sort: ${sort}, groupBy: ${JSON.stringify(groupBy)}})`);
        }
        /* v8 ignore stop */
        this.validateColumns([
            ...(select ?? []),
            ...(groupBy !== undefined ? [groupBy] : []),
            ...Object.keys(filter),
        ]);
        const resolvedSelect = Array.from(new Set([
            ...(select ?? Object.keys(this.schema)),
            ...getSortColumns(this.schema, sort, subqueries),
            ...getSubqueriesColumns(this.schema, subqueries),
        ])).sort();
        let result;
        if (groupBy === undefined) {
            if (subqueries === undefined) {
                result = this.getCachedQuery({
                    key: stringify({ filter, resolvedSelect, kind: 'linear' }),
                    sort,
                    subqueries: null,
                }, () => new LinearQueryWithoutSubqueriesImpl(this.items, resolvedSelect, filter, makeTiebrokenIdSort(sort)));
            }
            else {
                for (const subqueryKey of Object.keys(subqueries)) {
                    if (subqueryKey in this.schema) {
                        throw new Error(`key '${subqueryKey}' may not be reused for a subquery, since it's already in the schema`);
                    }
                }
                result = this.getCachedQuery({
                    key: stringify({
                        filter,
                        resolvedSelect,
                        kind: 'linearSubqueries',
                    }),
                    sort,
                    subqueries,
                }, () => new LinearQueryWithSubqueriesImpl(this.items, resolvedSelect, filter, makeTiebrokenIdSort(sort), subqueries, getSubqueriesDependencies(this.schema, subqueries)));
            }
        }
        else {
            if (subqueries === undefined) {
                result = this.getCachedQuery({
                    key: stringify({
                        filter,
                        resolvedSelect,
                        groupBy,
                        kind: 'grouped',
                    }),
                    sort,
                    subqueries: null,
                }, () => new GroupedQueryImpl(this.items, filter, groupBy, (group) => this.query({
                    select,
                    filter: { ...filter, [groupBy]: group },
                    sort: sort,
                })));
            }
            else {
                result = this.getCachedQuery({
                    key: stringify({
                        filter,
                        resolvedSelect,
                        groupBy,
                        kind: 'grouped',
                    }),
                    sort,
                    subqueries,
                }, () => new GroupedQueryImpl(this.items, filter, groupBy, (group) => this.query({
                    select,
                    filter: { ...filter, [groupBy]: group },
                    subqueries,
                    sort,
                })));
            }
        }
        return result;
    }
    count({ filter = {}, groupBy, }) {
        /* v8 ignore start */
        if (debug.on && !debug.makingSubquery) {
            debug.statements.push(`const query${++debug.counter} = ${this.debugName}.count(${{
                filter,
                groupBy,
            }})`);
        }
        /* v8 ignore stop */
        this.validateColumns([
            ...(groupBy !== undefined ? [groupBy] : []),
            ...Object.keys(filter),
        ]);
        let result;
        if (groupBy === undefined) {
            result = this.getCachedQuery({
                key: stringify({ filter, kind: 'count' }),
                sort: null,
                subqueries: null,
            }, () => new CountQueryImpl(this.items, filter));
        }
        else {
            result = this.getCachedQuery({
                key: stringify({ filter, groupBy, kind: 'groupCount' }),
                sort: null,
                subqueries: null,
            }, () => new GroupedQueryImpl(this.items, filter, groupBy, (group) => this.count({ filter: { ...filter, [groupBy]: group } })));
        }
        this.queryRegistry.register(result);
        return result;
    }
    groupBy({ groupBy, filter = {}, subquery, }) {
        return this.getCachedQuery({
            key: stringify({ groupBy, filter, kind: 'groupBy' }),
            sort: null,
            subqueries: subquery,
        }, () => new GroupedQueryImpl(this.items, filter, groupBy, subquery));
    }
    insert(row) {
        const id = UUID.create();
        this.yTable.set(id, new Y.Map(Object.entries(row)));
        /* v8 ignore start */
        if (debug.on) {
            debug.statements.push(`const row${++debug.counter}Id = ${this.debugName}.insert(${JSON.stringify(row)})`);
            debug.map.set(id, debug.counter);
        }
        /* v8 ignore stop */
        return id;
    }
    update(id, column, value) {
        /* v8 ignore start */
        if (debug.on) {
            debug.statements.push(`${this.debugName}.update(row${debug.map.get(id)}Id, '${column}', ${JSON.stringify(value)})`);
        }
        /* v8 ignore stop */
        this.yTable.get(id)?.set(column, value);
    }
    delete(id) {
        /* v8 ignore start */
        if (debug.on) {
            debug.statements.push(`${this.debugName}.delete(row${debug.map.get(id)}Id)`);
        }
        /* v8 ignore stop */
        this.yTable.delete(id);
    }
}
