import { UUID } from '../common/UUID'
import { Field } from './Schema'
import { Table } from './Table'
import * as Y from 'yjs'

import { beforeEach, expect, test, vi } from 'vitest'

const schema = {
    id: new Field<UUID>(),
    number: new Field<number>(),
    string: new Field<string>(),
}

let doc: Y.Doc
let yTable: Y.Map<Y.Map<unknown>>
let table: Table<typeof schema>
let ids: UUID[]

beforeEach(() => {
    doc = new Y.Doc()
    yTable = doc.getMap('table') as Y.Map<Y.Map<unknown>>
    table = new Table(yTable, schema)
    ids = [
        { number: 1, string: 'a' },
        { number: 2, string: 'b' },
    ].map(row => table.insert(row))
})

test('simple grouped query', () => {
    const query = table.query({ groupBy: 'number' })
    expect(query.result.get(1)[0].string).toBe('a')
})

