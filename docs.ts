// eslint-disable-next-line no-restricted-imports
import { UpdateDocs } from 'update-docs'

export const docs = new UpdateDocs({
	documentationGlobs: ['**/*.md'],
	testGlobs: ['test/docs/**/*.tsx'],
	valueIndent: '    ',
	modifyIndent: (indent) => indent.replace(/\t/g, '    '),
})
