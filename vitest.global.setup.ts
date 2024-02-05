// eslint-disable-next-line no-restricted-imports
import { UpdateDocs } from './test/docs/updateDocs'

console.log('global setup file')

export const docs = new UpdateDocs({
	indent: '\t',
})

export function setup() {
	console.log('setting up...')
	docs.updateExamples()
	return () => {
		console.log('tearing down...')
		docs.write()
	}
}

export function teardown() {
	console.log('tearing down...')
	docs.write()
}
