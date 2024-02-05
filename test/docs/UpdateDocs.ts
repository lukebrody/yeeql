// eslint-disable-next-line no-restricted-imports
import { DefaultMap } from '../../lib/common/DefaultMap'
import { globSync } from 'glob'
import * as fs from 'fs'
// @ts-expect-error Module problems
import stringify from '@aitodotai/json-stringify-pretty-compact'

/**
 * Implements syncing test cases to code examples in documentation files.
 *
 *	1.	Use `collectExamples()` to scan through test files and collect code between
 *		`// start docs Example Name`
 *		and
 *		`// end docs`
 *		comments. Multiple blocks for the same example will be concatenated.
 *
 *	2.	Use `replaceExamples(...)` to scan through documentation files and update code blocks
 *		under <!---Example Name--> comments.
 *
 *	3.	Run the tests. Use calls of `replaceToken(...)` to inject test data into the generated examples.
 * 		For example, you might want to have a comment about the value of an expression.
 */

type File = { readonly path: string; contents: string }

function readFiles(glob: string): File[] {
	return globSync(glob).map((path) => ({
		path,
		contents: fs.readFileSync(path).toString(),
	}))
}

function writeFiles(files: File[]) {
	for (const { path, contents } of files) {
		fs.writeFileSync(path, contents)
	}
}

export class UpdateDocs {
	documentationGlob: string
	testGlob: string

	documentationFiles: File[]
	testFiles: Readonly<File>[]
	indent: string

	constructor({
		documentationGlob,
		testGlob,
		indent,
	}: {
		documentationGlob: string
		testGlob: string
		indent: string
	}) {
		this.documentationGlob = documentationGlob
		this.testGlob = testGlob
		this.documentationFiles = readFiles(this.documentationGlob)
		this.testFiles = readFiles(this.testGlob)
		this.indent = indent
	}

	read() {
		const start = Date.now()
		this.documentationFiles = readFiles(this.documentationGlob)
		this.testFiles = readFiles(this.testGlob)
		console.log(`UpdateDocs took ${Date.now() - start}ms to read files`)
	}

	write() {
		const start = Date.now()
		writeFiles(this.documentationFiles)
		console.log(`UpdateDocs took ${Date.now() - start}ms to write files`)
	}

	exampleRegex(exampleName: string): RegExp {
		return new RegExp(
			`(<!---${exampleName}-->\\s*\`\`\`[A-z0-9]*)(.+?)(\`\`\`)`,
			'gs',
		)
	}

	codeBlockInTests(): RegExp {
		return /(?:^|\n)([^\S\n]*)\/\/ start docs (.+?)\n(.+?)\n[^\S\n]*\/\/ end docs/gs
	}

	collectExamples(): DefaultMap<string, string[]> {
		const result = new DefaultMap<string, string[]>(() => [])

		for (const { contents } of this.testFiles) {
			for (const [, indent, exampleName, code] of contents.matchAll(
				this.codeBlockInTests(),
			)) {
				const dedentedCode = code.replaceAll(new RegExp(`^${indent}`, 'gm'), '')
				result.get(exampleName).push(dedentedCode)
			}
		}

		return result
	}

	replaceExamples(examples: DefaultMap<string, string[]>): void {
		const pattern = this.exampleRegex('(.+?)')
		for (const file of this.documentationFiles) {
			file.contents = file.contents.replaceAll(pattern, (...args) => {
				const [, header, exampleName, , end] = args as string[]
				return [header, examples.get(exampleName).join('\n'), end].join('\n')
			})
		}
	}

	updateExamples(): void {
		this.replaceExamples(this.collectExamples())
	}

	stringifyValue(value: unknown): string {
		return typeof value === 'string'
			? value
			: stringify(value, { indent: this.indent, margins: true })
	}

	replaceToken(
		exampleName: string,
		token: RegExp | string,
		value: unknown,
	): void {
		const pattern = this.exampleRegex(exampleName)
		const stringValue = this.stringifyValue(value)
		let count = 0
		for (const file of this.documentationFiles) {
			file.contents = file.contents.replaceAll(pattern, (...args) => {
				const [, header, content, end] = args as string[]
				count += Array.from(content.matchAll(token as RegExp)).length
				const replacedContent = content.replaceAll(token, stringValue)
				return [header, replacedContent, end].join('')
			})
		}
		if (count !== 1) {
			throw new Error(`token ${token} appeared ${count} times`)
		}
	}
}
