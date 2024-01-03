import { UUID } from '../common/UUID';
import { LinearQueryChange } from './LinearQuery';
import { Query } from './Query';
import { QueryBase } from './QueryBase';
import { QueryRegistryEntry } from './QueryRegistry';
import { TableSchema, Row, Filter, SubqueryGenerator, SubqueryGenerators, SubqueriesResults, SubqueriesDependencies } from './Schema';
export type LinearQueryWithSubqueriesChange<Result, SubChange> = LinearQueryChange<Result> | {
    kind: 'subquery';
    row: Readonly<Result>;
    oldIndex: number;
    newIndex: number;
    subChange: SubChange;
    type: 'update';
};
type SubqueryChange<S extends TableSchema, Q extends SubqueryGenerator<S, unknown, unknown>> = Q extends SubqueryGenerator<S, unknown, infer Change> ? Change : never;
type SubqueriesChanges<S extends TableSchema, Q extends SubqueryGenerators<S>> = {
    [K in keyof Q]: SubqueryChange<S, Q[K]>;
};
type SubqueriesChange<T extends object> = {
    [K in keyof T]: {
        key: K;
        change: T[K];
    };
}[keyof T];
export type LinearQueryWithSubqueries<S extends TableSchema, Select extends keyof S, Q extends SubqueryGenerators<S>> = Query<ReadonlyArray<Readonly<RowWithSubqueries<S, Select, Q>>>, Change<S, Select, Q>>;
type Change<S extends TableSchema, Select extends keyof S, Q extends SubqueryGenerators<S>> = LinearQueryWithSubqueriesChange<Row<Pick<S, Select>> & SubqueriesResults<S, Q>, SubqueriesChange<SubqueriesChanges<S, Q>>>;
export type RowWithSubqueries<S extends TableSchema, Select extends keyof S, Q extends SubqueryGenerators<S>> = Row<Pick<S, Select>> & SubqueriesResults<S, Q>;
export declare class LinearQueryWithSubqueriesImpl<S extends TableSchema, Select extends keyof S, Q extends SubqueryGenerators<S>> extends QueryBase<Change<S, Select, Q>> implements QueryRegistryEntry<S>, LinearQueryWithSubqueries<S, Select, Q> {
    readonly filter: Filter<S>;
    readonly sort: (a: RowWithSubqueries<S, keyof S, Q>, b: RowWithSubqueries<S, keyof S, Q>) => number;
    readonly subQueries: Q;
    readonly subqueryDependencies: SubqueriesDependencies<S, Q>;
    constructor(items: ReadonlyMap<UUID, Row<S>>, select: ReadonlyArray<Select>, filter: Filter<S>, sort: (a: RowWithSubqueries<S, keyof S, Q>, b: RowWithSubqueries<S, keyof S, Q>) => number, subQueries: Q, subqueryDependencies: SubqueriesDependencies<S, Q>);
    private readonly rowMap;
    readonly select: ReadonlySet<keyof S>;
    readonly result: (Row<S> & SubqueriesResults<S, Q>)[];
    addRow(row: Row<S>, type: 'add' | 'update'): () => void;
    private makeInternalCallback;
    removeRow(row: Row<S>, type: 'delete' | 'update'): () => void;
    changeRow(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>, newValues: Readonly<Partial<Row<S>>>, patch: (row: Row<S>) => void): () => void;
}
export {};
