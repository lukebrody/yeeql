/* c8 ignore start */
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
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
	const observeRef = useRef(observe)
	observeRef.current = observe
	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			const observer = (change: QueryChange<Q>) => {
				observeRef.current?.(change)
				onStoreChange()
			}
			query.observe(observer)
			return () => query.unobserve(observer)
		},
		[query],
	)
	useSyncExternalStore(subscribe, () => query.version)
	return query.result
}
