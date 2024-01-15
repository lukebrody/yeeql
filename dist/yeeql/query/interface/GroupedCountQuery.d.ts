import { Query } from 'yeeql/query/Query';
import { ReadonlyDefaultMap } from 'common/DefaultMap';
export type GroupedCountQuery<Group> = Query<ReadonlyDefaultMap<Group, number>, Readonly<{
    group: Group;
    change: 1 | -1;
}>>;
