import { Filter, Row, TableSchema } from 'yeeql/table/Schema';
import { QueryRegistryEntry } from 'yeeql/table/QueryRegistry';
import { UUID } from 'common/UUID';
import { QueryBase } from 'yeeql/query/QueryBase';
import { CountQuery } from 'yeeql/query/interface/CountQuery';
export declare class CountQueryImpl<S extends TableSchema> extends QueryBase<1 | -1> implements QueryRegistryEntry<S>, CountQuery {
    readonly filter: Filter<S>;
    constructor(items: ReadonlyMap<UUID, Row<S>>, filter: Filter<S>);
    readonly select: ReadonlySet<keyof S>;
    result: number;
    addRow(): () => void;
    removeRow(): () => void;
    changeRow(): () => void;
}
