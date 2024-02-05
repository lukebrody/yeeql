// eslint-disable-next-line no-restricted-imports
import { UpdateDocs } from './test/docs/UpdateDocs'

export const docs = new UpdateDocs({
	documentationGlob: '**/*.md',
	testGlob: 'test/docs/**/*.tsx',
	indent: '\t',
})
