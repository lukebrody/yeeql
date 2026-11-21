/* c8 ignore next */
import stringify from 'json-stable-stringify'
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

type Lower<T> = { gt: T; gte?: never } | { gt?: never; gte: T }
type Upper<T> = { lt: T; lte?: never } | { lt?: never; lte: T }
type NoLower = { gt?: never; gte?: never }
type NoUpper = { lt?: never; lte?: never }

export type Range<T> = (Lower<T> & (Upper<T> | NoUpper)) | (NoLower & Upper<T>)

// Split by type so a range on a `number | string` column can't mix bound types
type RangeOf<T, P> = [Extract<T, P>] extends [never]
	? never
	: Range<Extract<T, P>>

export type Filter<S extends TableSchema> = {
	[F in keyof Primitives<S>]?:
		| Row<Primitives<S>>[F]
		| RangeOf<Row<Primitives<S>>[F], number>
		| RangeOf<Row<Primitives<S>>[F], string>
		| RangeOf<Row<Primitives<S>>[F], bigint>
}

export function isRange(value: unknown): value is Range<Comparable> {
	return typeof value === 'object' && value !== null
}

export function rangeBounds(range: Range<Comparable>): Comparable[] {
	return [range.gt, range.gte, range.lt, range.lte].filter(
		(bound): bound is Comparable => bound !== undefined,
	)
}

// `Filter` guarantees all bounds share a type
export function rangeType(range: Range<Comparable>): string {
	return typeof rangeBounds(range)[0]
}

// JSON writes Infinity, -Infinity and NaN all as null, drops undefined properties, and throws on bigints
export function stringifyKey(value: unknown): string {
	return stringify(value, {
		replacer: (_, value) =>
			value === undefined ||
			typeof value === 'bigint' ||
			(typeof value === 'number' && !Number.isFinite(value))
				? { [typeof value]: String(value) }
				: value,
	})
}

export function matchesFilter<S extends TableSchema>(
	filter: Filter<S>,
	row: Row<S>,
): boolean {
	return Object.entries(filter).every(([key, range]) => {
		const value = row[key]
		if (!isRange(range)) {
			// SameValueZero, to agree with the registry's Map lookup
			return value === range || (Number.isNaN(value) && Number.isNaN(range))
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

// Set while a Table handles Yjs events, so that a missed read doesn't stop the table partway through updating
let missedReads: { error: Error | undefined } | undefined

export function catchMissedReads(run: () => void): Error | undefined {
	const outer = missedReads
	missedReads = { error: undefined }
	try {
		run()
		return missedReads.error
	} finally {
		missedReads = outer
	}
}

// yeeql finds the columns a sort or subquery generator depends on by calling it once with placeholder values
export function guardColumnReads<R extends object>(
	row: R,
	filter: Readonly<Record<string, unknown>>,
	isAllowed: (column: string) => boolean,
	reader: string,
): R {
	return new Proxy(row, {
		get(target, key) {
			if (
				typeof key === 'string' &&
				key !== 'id' &&
				Object.hasOwn(target, key) &&
				// Rows only stay in the result while equality-filtered columns are unchanged
				!(Object.hasOwn(filter, key) && !isRange(filter[key])) &&
				!isAllowed(key)
			) {
				const error = new Error(
					`${reader} read column '${key}', which it didn't read when yeeql called it with placeholder values. Read each column before branching on any value.`,
				)
				if (missedReads === undefined) {
					throw error
				}
				missedReads.error ??= error
			}
			return Reflect.get(target, key)
		},
	})
}

/* v8 ignore start */
export function schemaToDebugString(schema: Schema) {
	return `{${Object.entries(schema)
		.map(([key]) => `${key}: new Field<any>()`)
		.join(', ')}}`
}
/* v8 ignore stop */
