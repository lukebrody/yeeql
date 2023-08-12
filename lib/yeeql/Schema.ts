import { UUID } from '../common/UUID'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class Field<Type> { }

type FieldType<F extends Field<unknown>> = F extends Field<infer T> ? T : never

export type Schema = {
    [key: string]: Field<unknown>
}

export type Row<S extends Schema> = {
    [F in keyof S]: FieldType<S[F]>
}

export type Primitive = string | number | bigint | boolean | undefined | null

export type Primitives<S extends Schema> = Pick<S, keyof {
    [F in keyof S as FieldType<S[F]> extends Primitive ? F : never]: S[F]
}>

export type Filter<S extends Schema> = Partial<Row<Primitives<S>>>

const mySchema = {
    id: new Field<UUID>()
}

const filter: Filter<typeof mySchema> = {}

const row: Row<typeof mySchema> = { id: UUID.create() }
