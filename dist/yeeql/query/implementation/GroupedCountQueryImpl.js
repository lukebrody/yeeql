import { DefaultMap } from '../../../common/DefaultMap';
import { QueryBase } from '../../../yeeql/query/QueryBase';
export class GroupedCountQueryImpl extends QueryBase {
    constructor(items, filter, groupBy) {
        super();
        this.filter = filter;
        this.groupBy = groupBy;
        this.result = new DefaultMap(() => 0);
        addItem: for (const [, row] of items) {
            for (const [key, value] of Object.entries(filter)) {
                if (row[key] !== value) {
                    continue addItem;
                }
            }
            this.result.set(row[groupBy], this.result.get(row[groupBy]) + 1);
        }
        this.filter = filter;
        this.select = new Set([groupBy]);
    }
    addRow(row) {
        return this.makeChange(() => {
            const addedGroup = row[this.groupBy];
            this.result.set(addedGroup, this.result.get(addedGroup) + 1);
            return { group: addedGroup, change: 1 };
        });
    }
    removeRow(row) {
        return this.makeChange(() => {
            const removedGroup = row[this.groupBy];
            this.result.set(removedGroup, this.result.get(removedGroup) - 1);
            return { group: removedGroup, change: -1 };
        });
    }
    changeRow(row, oldValues, newValues, patch) {
        const removedGroup = row[this.groupBy];
        patch(row);
        const addedGroup = row[this.groupBy];
        if (removedGroup !== addedGroup) {
            const removed = this.makeChange(() => {
                this.result.set(removedGroup, this.result.get(removedGroup) - 1);
                return { group: removedGroup, change: -1 };
            });
            const added = this.makeChange(() => {
                this.result.set(addedGroup, this.result.get(addedGroup) + 1);
                return { group: addedGroup, change: 1 };
            });
            return () => {
                removed();
                added();
            };
        }
        else {
            return () => undefined;
        }
    }
}
