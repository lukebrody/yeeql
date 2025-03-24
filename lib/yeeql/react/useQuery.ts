/* c8 ignore start */
import { useEffect, useMemo, useState } from 'react'
import { Query, QueryResult, QueryChange } from 'yeeql/query/Query'
/* c8 ignore stop */

/* c8 ignore next */
export function useQuery<
	Q extends Query<QueryResult<Q>, QueryChange<Q>, unknown>,
>(
	makeQuery: () => Q,
	deps: React.DependencyList | undefined,
	observe?: (change: QueryChange<Q>) => void,
): QueryResult<Q> {
	const query = useMemo(makeQuery, deps)
	const [, setCounter] = useState(0)
	useEffect(() => {
		const observer = (change: QueryChange<Q>) => {
			observe?.(change)
			setCounter((counter) => counter + 1)
		}
		query.observe(observer)
		return () => query.unobserve(observer)
	}, deps)
	return query.result
}
