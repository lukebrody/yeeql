import { TableSchema, Row } from 'yeeql/table/Schema';
import { SubqueryChange, SubqueryGenerators, SubqueriesResults } from 'yeeql/query/subquery';
import { Query } from 'yeeql/query/Query';
export type ResultRow<S extends TableSchema, Select extends keyof S, Q extends SubqueryGenerators<S>> = Readonly<Row<Pick<S, Select>>> & Readonly<SubqueriesResults<S, Q>>;
export type Change<S extends TableSchema, Select extends keyof S, Q extends SubqueryGenerators<S>> = Readonly<{
    kind: 'add';
    row: ResultRow<S, Select, Q>;
    newIndex: number;
    type: 'add' | 'update';
}> | Readonly<{
    kind: 'remove';
    row: ResultRow<S, Select, Q>;
    oldIndex: number;
    type: 'delete' | 'update';
}> | Readonly<{
    kind: 'update';
    row: ResultRow<S, Select, Q>;
    oldIndex: number;
    newIndex: number;
    oldValues: Partial<ResultRow<S, Select, Q>>;
    type: 'update';
}> | {
    [K in keyof Q]: Readonly<{
        kind: 'subquery';
        row: ResultRow<S, Select, Q>;
        oldIndex: number;
        newIndex: number;
        key: K;
        change: SubqueryChange<S, Q[K]>;
        type: 'update';
    }>;
}[keyof Q];
export type LinearQuery<S extends TableSchema, Select extends keyof S, Q extends SubqueryGenerators<S>> = Query<ReadonlyArray<ResultRow<S, Select, Q>>, Change<S, Select, Q>>;
