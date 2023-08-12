import { useEffect, useMemo, useState } from 'react'
import { Query, QueryResult, QueryChange } from "../Query"

export function useQuery<Q extends Query<QueryResult<Q>, QueryChange<Q>>>(
    makeQuery: () => Q,
    deps: React.DependencyList | undefined,
    observe?: (change: QueryChange<Q>) => void
): QueryResult<Q> {
    const query = useMemo(makeQuery, deps)
    const [, setCounter] = useState(0)
    useEffect(() => {
        const observer = (change: QueryChange<Q>) => {
            observe?.(change)
            setCounter(counter => counter + 1)
        }
        query.observe(observer)
        return () => query.unobserve(observer)
    }, deps)
    return query.result
}