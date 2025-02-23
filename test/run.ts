import { UpdateDocs } from 'update-docs'
import { run } from 'node:test'
import { spec, lcov } from 'node:test/reporters'
import fs from 'fs'

export const docs = new UpdateDocs({
	documentationGlobs: ['README.md', 'doc/*.md'],
	testGlobs: ['test/docs/**/*.{ts,tsx}'],
	valueIndent: '    ',
	modifyIndent: (indent) => indent.replace(/\t/g, '    '),
})

docs.updateExamples()

const testStream = run({
	globPatterns: ['test/**/*.test.{ts,tsx}'],
	isolation: 'none',
	coverage: true,
	coverageIncludeGlobs: ['lib/**/*.ts'],
})

testStream.on('test:summary', (event) => {
	if (event.success) {
		docs.write()
	}
})

testStream.compose(spec).pipe(process.stdout)

testStream.compose(lcov).pipe(fs.createWriteStream('lcov.info'))
