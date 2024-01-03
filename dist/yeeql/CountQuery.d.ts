import { Filter, Row, TableSchema } from './Schema';
import { QueryRegistryEntry } from './QueryRegistry';
import { UUID } from '../common/UUID';
import { Query } from './Query';
import { QueryBase } from './QueryBase';
export type CountQueryChange = 1 | -1;
export type CountQuery = Query<number, CountQueryChange>;
export declare class CountQueryImpl<S extends TableSchema> extends QueryBase<CountQueryChange> implements QueryRegistryEntry<S>, CountQuery {
    readonly filter: Filter<S>;
    constructor(items: ReadonlyMap<UUID, Row<S>>, filter: Filter<S>);
    readonly select: ReadonlySet<keyof S>;
    result: number;
    addRow(): () => void;
    removeRow(): () => void;
    changeRow(): () => void;
}
