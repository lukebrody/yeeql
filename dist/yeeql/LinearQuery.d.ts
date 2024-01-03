import { Filter, Row, TableSchema } from './Schema';
import { QueryRegistryEntry } from './QueryRegistry';
import { UUID } from '../common/UUID';
import { Query } from './Query';
import { QueryBase } from './QueryBase';
export type LinearQueryChange<Result> = {
    kind: 'add';
    row: Readonly<Result>;
    newIndex: number;
    type: 'add' | 'update';
} | {
    kind: 'remove';
    row: Readonly<Result>;
    oldIndex: number;
    type: 'delete' | 'update';
} | {
    kind: 'update';
    row: Readonly<Result>;
    oldIndex: number;
    newIndex: number;
    oldValues: Readonly<Partial<Result>>;
    type: 'update';
};
export type LinearQuery<Result> = Query<ReadonlyArray<Readonly<Result>>, LinearQueryChange<Result>>;
export declare class LinearQueryImpl<S extends TableSchema, Select extends keyof S> extends QueryBase<LinearQueryChange<Row<Pick<S, Select>>>> implements QueryRegistryEntry<S>, LinearQuery<Row<Pick<S, Select>>> {
    readonly filter: Filter<S>;
    readonly sort: (a: Row<S>, b: Row<S>) => number;
    constructor(items: ReadonlyMap<UUID, Row<S>>, select: ReadonlyArray<Select>, filter: Filter<S>, sort: (a: Row<S>, b: Row<S>) => number);
    readonly select: ReadonlySet<keyof S>;
    readonly result: Row<S>[];
    addRow(row: Row<S>, type: 'add' | 'update'): () => void;
    removeRow(row: Row<S>, type: 'delete' | 'update'): () => void;
    changeRow(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>, newValues: Readonly<Partial<Row<S>>>, patch: (row: Row<S>) => void): () => void;
}
