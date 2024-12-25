import { Filter, Primitives, Row, TableSchema } from '../../../yeeql/table/Schema';
import { QueryRegistryEntry } from '../../../yeeql/table/QueryRegistry';
import { UUID } from '../../../common/UUID';
import { ReadonlyDefaultMap } from '../../../common/DefaultMap';
import { Query, QueryChange, QueryResult } from '../../../yeeql/query/Query';
import { MinimalQueryChange, QueryBase } from '../../../yeeql/query/QueryBase';
import { GroupedQuery } from '../../../yeeql/query/interface/GroupedQuery';
export declare class GroupedQueryImpl<S extends TableSchema, GroupBy extends keyof Primitives<S>, Q extends Query<unknown, MinimalQueryChange, unknown>> extends QueryBase<QueryChange<GroupedQuery<S, GroupBy, Q>>> implements QueryRegistryEntry<S>, GroupedQuery<S, GroupBy, Q> {
    readonly filter: Filter<S>;
    readonly groupBy: GroupBy;
    readonly makeSubquery: (group: Row<Primitives<S>>[GroupBy]) => Q;
    constructor(items: ReadonlyMap<UUID, Row<S>>, filter: Filter<S>, groupBy: GroupBy, makeSubquery: (group: Row<Primitives<S>>[GroupBy]) => Q);
    readonly select: ReadonlySet<keyof S>;
    private readonly queries;
    readonly result: ReadonlyDefaultMap<Row<S>[GroupBy], QueryResult<Q>>;
    private addQuery;
    addRow(row: Row<S>, type: 'add' | 'update'): () => void;
    removeRow(row: Row<S>, type: 'delete' | 'update'): () => void;
    changeRow(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>, newValues: Readonly<Partial<Row<S>>>, patch: (row: Row<S>) => void): () => void;
}
