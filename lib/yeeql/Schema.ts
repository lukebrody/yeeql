import { UUID } from '../common/UUID'
import { Query } from './Query'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class Field<Type> { }

type FieldType<F extends Field<unknown>> = F extends Field<infer T> ? T : never

export type Schema = {
    [key: string]: Field<unknown>
}

export type Row<S extends Schema> = {
    [F in keyof S]: FieldType<S[F]>
}

export type TableSchema = Schema & { id: Field<UUID> }

export type Primitive = string | number | bigint | boolean | undefined | null

export type Primitives<S extends TableSchema> = Pick<S, keyof {
    [F in keyof S as FieldType<S[F]> extends Primitive ? F : never]: S[F]
}> & { id: Field<UUID> }

export type Filter<S extends TableSchema> = Partial<Row<Primitives<S>>>

export type SubqueryGenerator<S extends TableSchema, Result, Change> = (row: Row<S>) => Query<Result, Change>

export type SubqueryGenerators<S extends TableSchema> = {
	[key: string]: SubqueryGenerator<S, unknown, unknown>
}

export type SubqueryResult<S extends TableSchema, Q extends SubqueryGenerator<S, unknown, unknown>> = Q extends SubqueryGenerator<S, infer Result, unknown> ? Result : never

export type SubqueriesResults<S extends TableSchema, Q extends SubqueryGenerators<S>> = {
	[K in keyof Q]: SubqueryResult<S, Q[K]>
}