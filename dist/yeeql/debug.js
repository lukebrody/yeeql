export const debug = {
    on: false,
    statements: [],
    dump() {
        console.log(this.statements.join('\n'));
        this.statements = [];
    },
    counter: 0,
    map: new Map(),
    makingSubquery: false,
};
