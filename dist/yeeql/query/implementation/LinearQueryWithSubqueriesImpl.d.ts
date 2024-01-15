import { QueryBase } from 'yeeql/query/QueryBase';
import { SubqueriesDependencies, SubqueriesResults, SubqueryGenerators } from 'yeeql/query/subquery';
import { Filter, Row, TableSchema } from 'yeeql/table/Schema';
import { LinearQuery, Change, ResultRow } from 'yeeql/query/interface/LinearQuery';
import { QueryRegistryEntry } from 'yeeql/table/QueryRegistry';
import { UUID } from 'common/UUID';
export declare class LinearQueryWithSubqueriesImpl<S extends TableSchema, Select extends keyof S, Q extends SubqueryGenerators<S>> extends QueryBase<Change<S, Select, Q>> implements QueryRegistryEntry<S>, LinearQuery<S, Select, Q> {
    readonly filter: Filter<S>;
    readonly sort: (a: ResultRow<S, keyof S, Q>, b: ResultRow<S, keyof S, Q>) => number;
    readonly subQueries: Q;
    readonly subqueryDependencies: SubqueriesDependencies<S, Q>;
    constructor(items: ReadonlyMap<UUID, Row<S>>, select: ReadonlyArray<Select>, filter: Filter<S>, sort: (a: ResultRow<S, keyof S, Q>, b: ResultRow<S, keyof S, Q>) => number, subQueries: Q, subqueryDependencies: SubqueriesDependencies<S, Q>);
    private readonly rowMap;
    readonly select: ReadonlySet<keyof S>;
    readonly result: (Row<S> & SubqueriesResults<S, Q>)[];
    addRow(row: Row<S>, type: 'add' | 'update'): () => void;
    private makeInternalCallback;
    removeRow(row: Row<S>, type: 'delete' | 'update'): () => void;
    changeRow(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>, newValues: Readonly<Partial<Row<S>>>, patch: (row: Row<S>) => void): () => void;
}
