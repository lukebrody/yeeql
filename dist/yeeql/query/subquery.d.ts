import { DefaultMap } from 'common/DefaultMap';
import { Query } from 'yeeql/query/Query';
import { TableSchema, Row } from 'yeeql/table/Schema';
export type SubqueryGenerator<S extends TableSchema, Result, Change> = (row: Row<S>) => Query<Result, Change>;
export type SubqueryGenerators<S extends TableSchema> = {
    [key: string]: SubqueryGenerator<S, unknown, unknown>;
};
export type SubqueryResult<S extends TableSchema, Q extends SubqueryGenerator<S, unknown, unknown>> = Q extends SubqueryGenerator<S, infer Result, unknown> ? Result : never;
export type SubqueriesResults<S extends TableSchema, Q extends SubqueryGenerators<S>> = {
    [K in keyof Q]: SubqueryResult<S, Q[K]>;
};
export type SubqueriesDependencies<S extends TableSchema, Q extends SubqueryGenerators<S>> = DefaultMap<keyof S, Set<keyof Q>>;
export type SubqueryChange<S extends TableSchema, Q extends SubqueryGenerator<S, unknown, unknown>> = Q extends SubqueryGenerator<S, unknown, infer Change> ? Change : never;
