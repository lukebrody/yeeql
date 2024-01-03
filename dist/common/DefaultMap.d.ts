export interface ReadonlyDefaultMap<K, V> extends ReadonlyMap<K, V> {
    get(key: K): V;
}
export declare class DefaultMap<K, V> extends Map<K, V> implements ReadonlyDefaultMap<K, V> {
    private readonly makeDefault;
    get(key: K): V;
    constructor(makeDefault: () => V);
}
