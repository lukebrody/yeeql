import Base256 from 'base256-encoding';
const length = 8;
const result = {
    create() {
        const result = new Uint8Array(length);
        crypto.getRandomValues(result);
        return Base256.encode(result);
    },
    length,
    encode(uuid) {
        return Base256.decode(uuid);
    },
    decode(data) {
        const string = Base256.encode(data);
        if (string.length !== length) {
            throw new Error(`Encoded UUID of length ${string.length} was unexpected. Expected length is ${length}`);
        }
        return string;
    },
};
export const UUID = result;
