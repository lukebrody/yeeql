import { Filter, Row, TableSchema } from 'yeeql/table/Schema';
export declare const addedOrRemoved: unique symbol;
type AddedOrRemoved = typeof addedOrRemoved;
export declare const _testQueryEntries: {
    value: number;
};
export declare class QueryRegistry<S extends TableSchema> {
    private readonly finalizer;
    constructor(schema: S);
    private readonly fields;
    private readonly qt;
    register(query: QueryRegistryEntry<S>): void;
    queries(row: Row<S>, changes: Partial<Row<S>> | AddedOrRemoved): Set<QueryRegistryEntry<S>>;
}
export interface QueryRegistryEntry<S extends TableSchema> {
    readonly filter: Readonly<Filter<S>>;
    readonly select: ReadonlySet<keyof S>;
    /**
     * `type` is 'add' when this row is freshly added to the table, update when the row comes in scope of the filter
     * @returns a function that sends notifications to observers
     */
    addRow(row: Row<S>, type: 'add' | 'update'): () => void;
    /**
     * @returns a function that sends notifications to observers
     */
    removeRow(row: Row<S>, type: 'delete' | 'update'): () => void;
    /**
     * @param row is the table row, with the old values
     * @param oldValues is an object with the keys that will update, and the values they will update from
     * @param newValues is an object with the keys that will update, and the values they will update to
     * @param patch is a function that mutates `row` to have the new values. `patch` is required to be called during this implementation
     * @returns a function that sends notifications to observers
     */
    changeRow(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>, newValues: Readonly<Partial<Row<S>>>, patch: (row: Row<S>) => void): () => void;
}
export {};
