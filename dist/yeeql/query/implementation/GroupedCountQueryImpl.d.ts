import { Filter, Row, TableSchema } from 'yeeql/table/Schema';
import { QueryRegistryEntry } from 'yeeql/table/QueryRegistry';
import { UUID } from 'common/UUID';
import { DefaultMap } from 'common/DefaultMap';
import { QueryBase } from 'yeeql/query/QueryBase';
import { QueryChange } from 'yeeql/query/Query';
import { GroupedCountQuery } from 'yeeql/query/interface/GroupedCountQuery';
export declare class GroupedCountQueryImpl<S extends TableSchema, GroupBy extends keyof S> extends QueryBase<QueryChange<GroupedCountQuery<Row<S>[GroupBy]>>> implements QueryRegistryEntry<S>, GroupedCountQuery<Row<S>[GroupBy]> {
    readonly filter: Filter<S>;
    readonly groupBy: GroupBy;
    constructor(items: ReadonlyMap<UUID, Row<S>>, filter: Filter<S>, groupBy: GroupBy);
    readonly select: ReadonlySet<keyof S>;
    result: DefaultMap<Row<S>[GroupBy], number>;
    addRow(row: Row<S>): () => void;
    removeRow(row: Row<S>): () => void;
    changeRow(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>, newValues: Readonly<Partial<Row<S>>>, patch: (row: Row<S>) => void): () => void;
}
