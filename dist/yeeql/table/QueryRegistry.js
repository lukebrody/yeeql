import { DefaultMap } from 'common/DefaultMap';
const notSpecified = Symbol();
export const addedOrRemoved = Symbol();
function buildQueryTree(fields) {
    if (fields.length == 0) {
        const result = new DefaultMap(() => []);
        return result;
    }
    else {
        const result = new DefaultMap(() => buildQueryTree(fields.slice(1)));
        return result;
    }
}
function insertIntoQueryTree(qt, fields, query) {
    if (fields.length == 0) {
        const leaf = qt;
        const weakRef = new WeakRef(query);
        leaf.get(addedOrRemoved).push(weakRef);
        for (const observeKey of query.select) {
            leaf.get(observeKey).push(weakRef);
        }
        for (const filterKey of Object.keys(query.filter)) {
            if (!query.select.has(filterKey)) {
                leaf.get(filterKey).push(weakRef);
            }
        }
    }
    else {
        const node = qt;
        const key = fields[0] in query.filter
            ? query.filter[fields[0]]
            : notSpecified;
        insertIntoQueryTree(node.get(key), fields.slice(1), query);
    }
}
function deleteFromQueryTree(qt, fields, filter) {
    if (fields.length == 0) {
        const leaf = qt;
        for (const [key, arr] of leaf) {
            for (let i = 0; i < arr.length;) {
                if (arr[i].deref() === undefined) {
                    arr.splice(i, 1);
                }
                else {
                    i++;
                }
            }
            if (arr.length === 0) {
                leaf.delete(key);
            }
        }
    }
    else {
        const node = qt;
        const key = fields[0] in filter
            ? filter[fields[0]]
            : notSpecified;
        const child = node.get(key);
        deleteFromQueryTree(child, fields.slice(1), filter);
        if (child.size == 0) {
            node.delete(key);
        }
    }
}
export const _testQueryEntries = { value: 0 };
function collectFromQueryTree(qt, fields, row, changed, result) {
    if (fields.length === 0) {
        const leaf = qt;
        for (const key of changed === addedOrRemoved
            ? [addedOrRemoved]
            : Object.keys(changed)) {
            for (const weakQuery of leaf.get(key)) {
                const query = weakQuery.deref();
                _testQueryEntries.value++;
                if (query) {
                    result.add(query);
                }
            }
        }
    }
    else {
        const node = qt;
        collectFromQueryTree(node.get(notSpecified), fields.slice(1), row, changed, result);
        if (node.has(row[fields[0]])) {
            return collectFromQueryTree(node.get(row[fields[0]]), fields.slice(1), row, changed, result);
        }
    }
}
export class QueryRegistry {
    constructor(schema) {
        this.finalizer = new FinalizationRegistry((filter) => deleteFromQueryTree(this.qt, this.fields, filter));
        this.fields = Object.keys(schema).sort();
        this.qt = buildQueryTree(this.fields);
    }
    register(query) {
        insertIntoQueryTree(this.qt, this.fields, query);
        this.finalizer.register(query, query.filter);
    }
    queries(row, changes) {
        const result = new Set();
        collectFromQueryTree(this.qt, this.fields, row, changes, result);
        return result;
    }
}
