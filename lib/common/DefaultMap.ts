export interface ReadonlyDefaultMap<K, V> extends ReadonlyMap<K, V> {
	get(key: K): V
}

export class DefaultMap<K, V> extends Map<K, V> implements ReadonlyDefaultMap<K, V> {

	get(key: K): V {
		let result = super.get(key)
		if (result === undefined) {
			result = this.makeDefault()
			this.set(key, result)
		}
		return result
	}

	constructor(private readonly makeDefault: () => V) {
		super()
	}
}