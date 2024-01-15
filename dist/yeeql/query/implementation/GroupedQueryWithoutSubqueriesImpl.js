import { insertOrdered, removeOrdered } from 'common/array';
import { DefaultMap } from 'common/DefaultMap';
import { QueryBase } from 'yeeql/query/QueryBase';
export class GroupedQueryWithoutSubqueriesImpl extends QueryBase {
    constructor(items, select, filter, sort, groupBy) {
        super();
        this.filter = filter;
        this.sort = sort;
        this.groupBy = groupBy;
        this.result = new DefaultMap(() => []);
        addItem: for (const [, row] of items) {
            for (const [key, value] of Object.entries(filter)) {
                if (row[key] !== value) {
                    continue addItem;
                }
            }
            insertOrdered(this.result.get(row[groupBy]), row, sort);
        }
        this.select = new Set([...select, groupBy]);
    }
    addRow(row, type) {
        return this.makeChange(() => {
            const group = row[this.groupBy];
            const newIndex = insertOrdered(this.result.get(group), row, this.sort);
            return { kind: 'add', row, group, newIndex, type };
        });
    }
    removeRow(row, type) {
        return this.makeChange(() => {
            const group = row[this.groupBy];
            const oldIndex = removeOrdered(this.result.get(group), row, this.sort).index;
            if (this.result.get(group).length === 0) {
                this.result.delete(group);
            }
            return {
                kind: 'remove',
                row,
                group,
                oldIndex,
                type,
            };
        });
    }
    changeRow(row, oldValues, newValues, patch) {
        if (!(this.groupBy in oldValues) ||
            oldValues[this.groupBy] === newValues[this.groupBy]) {
            const group = row[this.groupBy];
            return this.makeChange(() => {
                const oldIndex = removeOrdered(this.result.get(group), row, this.sort).index;
                patch(row);
                const newIndex = insertOrdered(this.result.get(group), row, this.sort);
                return {
                    kind: 'update',
                    row,
                    oldIndex: oldIndex,
                    newIndex: newIndex,
                    oldValues: oldValues,
                    group,
                    type: 'update',
                };
            });
        }
        else {
            const removeResult = this.removeRow(row, 'update');
            patch(row);
            const addResult = this.addRow(row, 'update');
            return () => {
                removeResult();
                addResult();
            };
        }
    }
}
