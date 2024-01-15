import { ReadonlyDefaultMap } from 'common/DefaultMap';
import { UUID } from 'common/UUID';
import { YMap } from 'yeeql/YInterfaces';
import { QueryResult } from 'yeeql/query/Query';
import { CountQuery } from 'yeeql/query/interface/CountQuery';
import { GroupedCountQuery } from 'yeeql/query/interface/GroupedCountQuery';
import { GroupedQuery } from 'yeeql/query/interface/GroupedQuery';
import { LinearQuery } from 'yeeql/query/interface/LinearQuery';
import { Filter, Primitives, Row, TableSchema } from 'yeeql/table/Schema';
import { SubqueryGenerators, SubqueryResult } from 'yeeql/query/subquery';
type Sort<S extends TableSchema, Q extends SubqueryGenerators<S>> = (a: Row<Primitives<S>> & PrimitiveSubqueriesResults<S, Q>, b: Row<Primitives<S>> & PrimitiveSubqueriesResults<S, Q>) => number;
type PrimitiveQueryResult<Result> = Result extends QueryResult<LinearQuery<infer S, infer Select, infer Q>> ? ReadonlyArray<Readonly<Row<Primitives<Pick<S, Select>>> & PrimitiveSubqueriesResults<S, Q>>> : Result extends ReadonlyDefaultMap<infer GroupValue, ReadonlyArray<Readonly<Row<infer Schema>>>> ? ReadonlyDefaultMap<GroupValue, ReadonlyArray<Readonly<Row<Primitives<Schema>>>>> : Result extends number ? number : Result extends ReadonlyDefaultMap<infer Group, number> ? ReadonlyDefaultMap<Group, number> : never;
type PrimitiveSubqueriesResults<S extends TableSchema, Q extends SubqueryGenerators<S>> = {
    [K in keyof Q]: PrimitiveQueryResult<SubqueryResult<S, Q[K]>>;
};
export declare class Table<S extends TableSchema> {
    private readonly yTable;
    private readonly schema;
    constructor(yTable: YMap<YMap<unknown>>, schema: S, debugName?: string);
    readonly debugName: string;
    private readonly queryRegistry;
    private readonly items;
    private mapValueToRow;
    private readonly queryCache;
    private readonly queryFinalizer;
    private getCachedQuery;
    private validateColumns;
    query<Select extends keyof S>(_: {
        select?: ReadonlyArray<Select>;
        filter?: Filter<S>;
        subqueries?: undefined;
        sort?: Sort<S, {}>;
    }): LinearQuery<S, Select, {}>;
    query<Select extends keyof S, Q extends SubqueryGenerators<S>>(_: {
        select?: ReadonlyArray<Select>;
        filter?: Filter<S>;
        subqueries: Q;
        sort?: Sort<S, Q>;
    }): LinearQuery<S, keyof S, Q>;
    query<Select extends keyof S, GroupBy extends keyof Primitives<S>>(_: {
        select?: ReadonlyArray<Select>;
        filter?: Filter<S>;
        groupBy: GroupBy;
        sort?: Sort<S, {}>;
    }): GroupedQuery<S, Select, GroupBy, {}>;
    query<Select extends keyof S, GroupBy extends keyof Primitives<S>, Q extends SubqueryGenerators<S>>(_: {
        select?: ReadonlyArray<Select>;
        filter?: Filter<S>;
        groupBy: GroupBy;
        subqueries: Q;
        sort?: Sort<S, {}>;
    }): GroupedQuery<S, Select, GroupBy, Q>;
    count(_: {
        filter?: Filter<S>;
    }): CountQuery;
    count<GroupBy extends keyof Primitives<S>>(_: {
        filter?: Filter<S>;
        groupBy: GroupBy;
    }): GroupedCountQuery<Row<S>[GroupBy]>;
    insert(row: Omit<Row<S>, 'id'>): UUID;
    update<K extends Exclude<keyof S, 'id'> & string>(id: UUID, column: K, value: Row<S>[K]): void;
    delete(id: UUID): void;
    private makeTiebrokenIdSort;
}
export {};
