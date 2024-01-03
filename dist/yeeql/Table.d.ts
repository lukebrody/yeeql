import { UUID } from '../common/UUID';
import { LinearQuery } from './LinearQuery';
import { GroupedQuery } from './GroupedQuery';
import { CountQuery } from './CountQuery';
import { GroupedCountQuery } from './GroupedCountQuery';
import { ReadonlyDefaultMap } from '../common/DefaultMap';
import { YMap } from './YInterfaces';
import { Row, Primitives, Filter, TableSchema, SubqueryGenerators, SubqueryResult } from './Schema';
import { LinearQueryWithSubqueries, RowWithSubqueries } from './LinearQueryWithSubqueries';
type Sort<S extends TableSchema, Q extends SubqueryGenerators<S>> = (a: Row<Primitives<S>> & PrimitiveSubqueriesResults<S, Q>, b: Row<Primitives<S>> & PrimitiveSubqueriesResults<S, Q>) => number;
type PrimitiveQueryResult<QueryResult> = QueryResult extends ReadonlyArray<Readonly<RowWithSubqueries<infer S, infer Select, infer Q>>> ? ReadonlyArray<Readonly<Row<Primitives<Pick<S, Select>>> & PrimitiveSubqueriesResults<S, Q>>> : QueryResult extends ReadonlyDefaultMap<infer GroupValue, ReadonlyArray<Readonly<Row<infer Schema>>>> ? ReadonlyDefaultMap<GroupValue, ReadonlyArray<Readonly<Row<Primitives<Schema>>>>> : QueryResult extends number ? number : QueryResult extends ReadonlyDefaultMap<infer Group, number> ? ReadonlyDefaultMap<Group, number> : never;
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
    }): LinearQuery<Row<Pick<S, Select>>>;
    query<Select extends keyof S, Q extends SubqueryGenerators<S>>(_: {
        select?: ReadonlyArray<Select>;
        filter?: Filter<S>;
        subqueries: Q;
        sort?: Sort<S, Q>;
    }): LinearQueryWithSubqueries<S, keyof S, Q>;
    query<Select extends keyof S, GroupBy extends keyof Primitives<S>>(_: {
        select?: ReadonlyArray<Select>;
        filter?: Filter<S>;
        sort?: Sort<S, {}>;
        groupBy: GroupBy;
    }): GroupedQuery<Row<Pick<S, Select>>, Row<Primitives<S>>[GroupBy]>;
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
