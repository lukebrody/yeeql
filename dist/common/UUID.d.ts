export type UUID = string & {
    __requestId: true;
};
declare const result: {
    create(): UUID;
    length: number;
    encode(uuid: UUID): Uint8Array;
    decode(data: Uint8Array): UUID;
};
export declare const UUID: Readonly<typeof result>;
export {};
