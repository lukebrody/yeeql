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

export type TableSchema = Schema & { id: Field<UUID> }

export type Primitive = string | number | bigint | boolean | undefined | null

export type Primitives<S extends TableSchema> = Pick<S, keyof {
    [F in keyof S as FieldType<S[F]> extends Primitive ? F : never]: S[F]
}> & { id: Field<UUID> }

export type Filter<S extends TableSchema> = Partial<Row<Primitives<S>>>

const mySchema = {
    id: new Field<UUID>()
}

const primitive: Primitives<typeof mySchema> = mySchema

primitive.id

const row: Row<{ id: Field<UUID> }> = { id: UUID.create() }

row.id