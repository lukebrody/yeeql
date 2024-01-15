/// <reference types="react" />
import { Query, QueryResult, QueryChange } from '../../yeeql/query/Query';
export declare function useQuery<Q extends Query<QueryResult<Q>, QueryChange<Q>, unknown>>(makeQuery: () => Q, deps: React.DependencyList | undefined, observe?: (change: QueryChange<Q>) => void): QueryResult<Q>;
