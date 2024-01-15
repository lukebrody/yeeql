import { Filter, Primitives, Row, TableSchema } from '../../../yeeql/table/Schema';
import { QueryRegistryEntry } from '../../../yeeql/table/QueryRegistry';
import { UUID } from '../../../common/UUID';
import { DefaultMap } from '../../../common/DefaultMap';
import { QueryChange } from '../../../yeeql/query/Query';
import { QueryBase } from '../../../yeeql/query/QueryBase';
import { GroupedQuery } from '../../../yeeql/query/interface/GroupedQuery';
export declare class GroupedQueryWithoutSubqueriesImpl<S extends TableSchema, Select extends keyof S, GroupBy extends keyof Primitives<S>> extends QueryBase<QueryChange<GroupedQuery<S, Select, GroupBy, {}>>> implements QueryRegistryEntry<S>, GroupedQuery<S, Select, GroupBy, {}> {
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
