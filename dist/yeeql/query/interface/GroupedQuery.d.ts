import { ReadonlyDefaultMap } from 'common/DefaultMap';
import { Query } from 'yeeql/query/Query';
import { Primitives, Row, TableSchema } from 'yeeql/table/Schema';
import { ResultRow as LinearQueryResultRow, Change as LinearQueryChange } from 'yeeql/query/interface/LinearQuery';
import { SubqueryGenerators } from 'yeeql/query/subquery';
export type GroupedQuery<S extends TableSchema, Select extends keyof S, GroupBy extends keyof Primitives<S>, Q extends SubqueryGenerators<S>> = Query<ReadonlyDefaultMap<Row<Primitives<S>>[GroupBy], ReadonlyArray<LinearQueryResultRow<S, Select, Q>>>, LinearQueryChange<S, Select, Q> & Readonly<{
    group: Row<Primitives<S>>[GroupBy];
}>>;
