import { Query } from 'yeeql/query/Query'

export type CountQuery = Query<number, 1 | -1, number>
