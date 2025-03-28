/* v8 ignore start */
import { Query } from 'yeeql/query/Query'

export type CountQuery = Query<
	number,
	| { delta: 1; type: 'add' | 'update' }
	| { delta: -1; type: 'update' | 'delete' },
	number
>
/* v8 ignore stop */
