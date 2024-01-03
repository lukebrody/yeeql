export class DefaultMap extends Map {
    get(key) {
        let result = super.get(key);
        if (result === undefined) {
            result = this.makeDefault();
            this.set(key, result);
        }
        return result;
    }
    constructor(makeDefault) {
        super();
        this.makeDefault = makeDefault;
    }
}
