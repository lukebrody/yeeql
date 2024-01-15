import { insertOrdered, removeOrdered } from 'common/array';
import { QueryBase } from 'yeeql/query/QueryBase';
export class LinearQueryImpl extends QueryBase {
    constructor(items, select, filter, sort) {
        super();
        this.filter = filter;
        this.sort = sort;
        this.result = [];
        addItem: for (const [, row] of items) {
            for (const [key, value] of Object.entries(filter)) {
                if (row[key] !== value) {
                    continue addItem;
                }
            }
            insertOrdered(this.result, row, sort);
        }
        this.select = new Set(select);
    }
    addRow(row, type) {
        return this.makeChange(() => {
            const addedIndex = insertOrdered(this.result, row, this.sort);
            return {
                kind: 'add',
                row,
                newIndex: addedIndex,
                type,
            };
        });
    }
    removeRow(row, type) {
        return this.makeChange(() => {
            const removedIndex = removeOrdered(this.result, row, this.sort).index;
            return {
                kind: 'remove',
                row,
                oldIndex: removedIndex,
                type,
            };
        });
    }
    changeRow(row, oldValues, newValues, patch) {
        return this.makeChange(() => {
            const removedIndex = removeOrdered(this.result, row, this.sort).index;
            patch(row);
            const addedIndex = insertOrdered(this.result, row, this.sort);
            return {
                kind: 'update',
                row: row,
                oldIndex: removedIndex,
                newIndex: addedIndex,
                oldValues: oldValues,
                type: 'update',
            };
        });
    }
}
