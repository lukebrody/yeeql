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
    addRow() {
        return this.makeChange(() => {
            this.result++;
            return 1;
        });
    }
    removeRow() {
        return this.makeChange(() => {
            this.result--;
            return -1;
        });
    }
    changeRow() {
        return () => undefined;
    }
}
