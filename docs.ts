// eslint-disable-next-line no-restricted-imports
import { UpdateDocs } from 'update-docs'

export const docs = new UpdateDocs({
	documentationGlobs: ['README.md', 'doc/*.md'],
	testGlobs: ['test/docs/**/*.{ts,tsx}'],
	valueIndent: '    ',
	modifyIndent: (indent) => indent.replace(/\t/g, '    '),
})
