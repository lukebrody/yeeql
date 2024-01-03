import { Filter, Row, TableSchema } from './Schema';
import { QueryRegistryEntry } from './QueryRegistry';
import { UUID } from '../common/UUID';
import { DefaultMap, ReadonlyDefaultMap } from '../common/DefaultMap';
import { Query } from './Query';
import { QueryBase } from './QueryBase';
export type GroupedCountQueryChange<Group> = {
    group: Group;
    change: 1 | -1;
};
export type GroupedCountQuery<Group> = Query<ReadonlyDefaultMap<Group, number>, GroupedCountQueryChange<Group>>;
export declare class GroupedCountQueryImpl<S extends TableSchema, GroupBy extends keyof S> extends QueryBase<GroupedCountQueryChange<Row<S>[GroupBy]>> implements QueryRegistryEntry<S>, GroupedCountQuery<Row<S>[GroupBy]> {
    readonly filter: Filter<S>;
    readonly groupBy: GroupBy;
    constructor(items: ReadonlyMap<UUID, Row<S>>, filter: Filter<S>, groupBy: GroupBy);
    readonly select: ReadonlySet<keyof S>;
    result: DefaultMap<Row<S>[GroupBy], number>;
    addRow(row: Row<S>): () => void;
    removeRow(row: Row<S>): () => void;
    changeRow(row: Row<S>, oldValues: Readonly<Partial<Row<S>>>, newValues: Readonly<Partial<Row<S>>>, patch: (row: Row<S>) => void): () => void;
}
