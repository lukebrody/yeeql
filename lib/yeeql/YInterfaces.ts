/* eslint-disable @typescript-eslint/no-explicit-any */
export interface YMap<V> {
    forEach(f: (v: V, k: string) => void): void
    observeDeep(observer: (events: YEvent[]) => void): void
    get(key: string): V | undefined
    set(key: string, value: V): void
    delete(key: string): void
}

export interface YEvent {
    readonly target: any
    readonly keys: ReadonlyMap<string, { action: 'add' | 'update' | 'delete', oldValue: any, newValue: any }>
    readonly path: ReadonlyArray<string | number>
}