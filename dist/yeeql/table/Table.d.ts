import { UUID } from '../../common/UUID';
import { YMap } from '../../yeeql/YInterfaces';
import { Query } from '../../yeeql/query/Query';
import { CountQuery } from '../../yeeql/query/interface/CountQuery';
import { GroupedQuery } from '../../yeeql/query/interface/GroupedQuery';
import { LinearQuery } from '../../yeeql/query/interface/LinearQuery';
import { Filter, Primitives, Row, TableSchema } from '../../yeeql/table/Schema';
import { SubqueriesPrimitiveResults, SubqueryGenerators } from '../../yeeql/query/subquery';
import { MinimalQueryChange } from '../../yeeql/query/QueryBase';
type Sort<S extends TableSchema, Q extends SubqueryGenerators<S>> = (a: Row<Primitives<S>> & SubqueriesPrimitiveResults<S, Q>, b: Row<Primitives<S>> & SubqueriesPrimitiveResults<S, Q>) => number;
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
    }): GroupedQuery<S, GroupBy, LinearQuery<S, Select, {}>>;
    query<Select extends keyof S, GroupBy extends keyof Primitives<S>, Q extends SubqueryGenerators<S>>(_: {
        select?: ReadonlyArray<Select>;
        filter?: Filter<S>;
        groupBy: GroupBy;
        subqueries: Q;
        sort?: Sort<S, Q>;
    }): GroupedQuery<S, GroupBy, LinearQuery<S, Select, Q>>;
    count(_: {
        filter?: Filter<S>;
    }): CountQuery;
    count<GroupBy extends keyof Primitives<S>>(_: {
        filter?: Filter<S>;
        groupBy: GroupBy;
    }): GroupedQuery<S, GroupBy, CountQuery>;
    groupBy<GroupBy extends keyof Primitives<S>, Q extends Query<unknown, MinimalQueryChange, unknown>>({ groupBy, filter, subquery, }: {
        groupBy: GroupBy;
        filter?: Filter<S>;
        subquery: (group: Row<Primitives<S>>[GroupBy]) => Q;
    }): GroupedQuery<S, GroupBy, Q>;
    insert(row: Omit<Row<S>, 'id'>): UUID;
    update<K extends Exclude<keyof S, 'id'> & string>(id: UUID, column: K, value: Row<S>[K]): void;
    delete(id: UUID): void;
}
export {};
