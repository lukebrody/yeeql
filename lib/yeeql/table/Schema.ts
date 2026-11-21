/* c8 ignore next */
import { UUID } from 'common/UUID'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class Field<Type> {}

type FieldType<F extends Field<unknown>> = F extends Field<infer T> ? T : never

export type Schema = {
	[key: string]: Field<unknown>
}

export type Row<S extends Schema> = {
	[F in keyof S]: FieldType<S[F]>
}

export type TableSchema = Schema & { id: Field<UUID> }

export type Primitive = string | number | bigint | boolean | undefined | null

export type Primitives<S extends Schema> = Pick<
	S,
	keyof {
		[F in keyof S as FieldType<S[F]> extends Primitive ? F : never]: S[F]
	}
> & { id: Field<UUID> }

export type Comparable = number | string | bigint

export type Range<T> = { gt?: T; gte?: T; lt?: T; lte?: T }

export type Filter<S extends TableSchema> = {
	[F in keyof Primitives<S>]?:
		| Row<Primitives<S>>[F]
		| Range<Extract<Row<Primitives<S>>[F], Comparable>>
}

export function isRange(value: unknown): value is Range<Comparable> {
	return typeof value === 'object' && value !== null
}

export function rangeBounds(range: Range<Comparable>): Comparable[] {
	return [range.gt, range.gte, range.lt, range.lte].filter(
		(bound): bound is Comparable => bound !== undefined,
	)
}

// `validateFilter` guarantees all bounds share a type
export function rangeType(range: Range<Comparable>): string {
	return typeof rangeBounds(range)[0]
}

export function matchesFilter<S extends TableSchema>(
	filter: Filter<S>,
	row: Row<S>,
): boolean {
	return Object.entries(filter).every(([key, range]) => {
		const value = row[key]
		if (!isRange(range)) {
			return value === range
		}
		if (typeof value !== rangeType(range)) {
			return false
		}
		const comparable = value as Comparable
		return (
			(range.gt === undefined || comparable > range.gt) &&
			(range.gte === undefined || comparable >= range.gte) &&
			(range.lt === undefined || comparable < range.lt) &&
			(range.lte === undefined || comparable <= range.lte)
		)
	})
}

export function validateFilter<S extends TableSchema>(filter: Filter<S>) {
	for (const [key, range] of Object.entries(filter)) {
		if (!isRange(range)) {
			continue
		}
		const bounds = rangeBounds(range)
		if (bounds.length === 0) {
			throw new Error(`range for '${key}' has no bounds`)
		}
		if (
			(range.gt !== undefined && range.gte !== undefined) ||
			(range.lt !== undefined && range.lte !== undefined)
		) {
			throw new Error(`range for '${key}' has redundant bounds`)
		}
		const type = typeof bounds[0]
		if (
			!['number', 'string', 'bigint'].includes(type) ||
			bounds.some((bound) => typeof bound !== type || Number.isNaN(bound))
		) {
			throw new Error(
				`range bounds for '${key}' must be all numbers, all strings, or all bigints`,
			)
		}
	}
}

/* v8 ignore start */
export function schemaToDebugString(schema: Schema) {
	return `{${Object.entries(schema)
		.map(([key]) => `${key}: new Field<any>()`)
		.join(', ')}}`
}
/* v8 ignore stop */
