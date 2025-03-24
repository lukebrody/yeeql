/* v8 ignore start */
export interface ReadonlyDefaultMap<K, V> extends ReadonlyMap<K, V> {
	get(key: K): V
}
/* v8 ignore stop */

export class DefaultMap<K, V>
	extends Map<K, V>
	implements ReadonlyDefaultMap<K, V>
{
	get(key: K): V {
		let result = super.get(key)
		if (result === undefined) {
			result = this.makeDefault(key)
			this.set(key, result)
		}
		return result
	}

	constructor(private readonly makeDefault: (key: K) => V) {
		super()
	}
	/* v8 ignore start */
}
/* v8 ignore stop */

export type MapValue<A> = A extends Map<unknown, infer V> ? V : never
