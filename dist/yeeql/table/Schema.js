// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class Field {
}
/* v8 ignore start */
export function schemaToDebugString(schema) {
    return `{${Object.entries(schema)
        .map(([key]) => `${key}: new Field<any>()`)
        .join(', ')}}`;
}
/* v8 ignore stop */
