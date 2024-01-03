import { Filter, Primitives, Row, TableSchema } from './Schema';
import { QueryRegistryEntry } from './QueryRegistry';
import { UUID } from '../common/UUID';
import { LinearQueryChange } from './LinearQuery';
import { DefaultMap, ReadonlyDefaultMap } from '../common/DefaultMap';
import { Query } from './Query';
import { QueryBase } from './QueryBase';
type GroupedQueryChange<Result, GroupValue> = LinearQueryChange<Result> & {
    group: GroupValue;
};
export type GroupedQuery<Result, GroupValue> = Query<ReadonlyDefaultMap<GroupValue, ReadonlyArray<Readonly<Result>>>, GroupedQueryChange<Result, GroupValue>>;
export declare class GroupedQueryImpl<S extends TableSchema, Select extends keyof S, GroupBy extends keyof Primitives<S>> extends QueryBase<GroupedQueryChange<Row<Pick<S, Select>>, Row<Primitives<S>>[GroupBy]>> implements QueryRegistryEntry<S>, GroupedQuery<Row<Pick<S, Select>>, Row<Primitives<S>>[GroupBy]> {
    readonly filter: Filter<S>;
    readonly sort: (a: Row<S>, b: Row<S>) => number;
    readonly groupBy: GroupBy;
    constructor(items: ReadonlyMap<UUID, Row<S>>, select: ReadonlyArray<Select>, filter: Filter<S>, sort: (a: Row<S>, b: Row<S>) => number, groupBy: GroupBy);
    readonly select: ReadonlySet<keyof S>;
    readonly result: DefaultMap<Row<S>[GroupBy], Row<S>[]>;
    addRow(row: Row<S>, type: 'add' | 'update'): () => void;
    removeRow(row: Row<S>, type: 'delete' | 'update'): () => void;
    changeRow(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>, newValues: Readonly<Partial<Row<S>>>, patch: (row: Row<S>) => void): () => void;
}
export {};
