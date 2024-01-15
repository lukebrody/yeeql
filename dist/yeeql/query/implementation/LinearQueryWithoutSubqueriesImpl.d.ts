import { UUID } from 'common/UUID';
import { QueryBase } from 'yeeql/query/QueryBase';
import { QueryRegistryEntry } from 'yeeql/table/QueryRegistry';
import { TableSchema, Row, Filter } from 'yeeql/table/Schema';
import { LinearQuery } from 'yeeql/query/interface/LinearQuery';
import { QueryChange } from 'yeeql/query/Query';
export declare class LinearQueryWithoutSubqueriesImpl<S extends TableSchema, Select extends keyof S> extends QueryBase<QueryChange<LinearQuery<S, Select, {}>>> implements QueryRegistryEntry<S>, LinearQuery<S, Select, {}> {
    readonly filter: Filter<S>;
    readonly sort: (a: Row<S>, b: Row<S>) => number;
    constructor(items: ReadonlyMap<UUID, Row<S>>, select: ReadonlyArray<Select>, filter: Filter<S>, sort: (a: Row<S>, b: Row<S>) => number);
    readonly select: ReadonlySet<keyof S>;
    readonly result: Row<S>[];
    addRow(row: Row<S>, type: 'add' | 'update'): () => void;
    removeRow(row: Row<S>, type: 'delete' | 'update'): () => void;
    changeRow(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>, newValues: Readonly<Partial<Row<S>>>, patch: (row: Row<S>) => void): () => void;
}
