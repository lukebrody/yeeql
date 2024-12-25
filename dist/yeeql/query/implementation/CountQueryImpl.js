import { QueryBase } from '../../../yeeql/query/QueryBase';
export class CountQueryImpl extends QueryBase {
    constructor(items, filter) {
        super();
        this.filter = filter;
        this.select = new Set();
        this.result = 0;
        addItem: for (const [, row] of items) {
            for (const [key, value] of Object.entries(filter)) {
                if (row[key] !== value) {
                    continue addItem;
                }
            }
            this.result++;
        }
    }
    addRow(row, type) {
        return this.notifyingObservers(() => {
            this.result++;
            return { delta: 1, type };
        });
    }
    removeRow(row, type) {
        return this.notifyingObservers(() => {
            this.result--;
            return { delta: -1, type };
        });
    }
    changeRow() {
        return () => undefined;
    }
}
