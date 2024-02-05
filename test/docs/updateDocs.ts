import { DefaultMap } from 'common/DefaultMap'
import { globSync } from 'glob'
import * as fs from 'fs'
// @ts-expect-error Module problems
import stringify from '@aitodotai/json-stringify-pretty-compact'

/**
 * Implements syncing test cases to code examples in *.md files.
 *
 *	1.	Use `collectExamples()` to scan through *.ts files and collect code between
 *		`// start docs Example Name`
 *		and
 *		`// end docs`
 *		comments. Multiple blocks for the same example will be concatenated.
 *
 *	2.	Use `replaceExamples(...)` to scan through *.md files and update ```typescript code blocks
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
	readonly documentationFiles: File[]
	readonly testFiles: Readonly<File>[]
	indent: string

	constructor({
		documentationFiles = '**/*.md',
		testFiles = 'test/docs/**/*.tsx',
		indent = '  ',
	} = {}) {
		this.documentationFiles = readFiles(documentationFiles)
		this.testFiles = readFiles(testFiles)
		this.indent = indent
	}

	write() {
		console.log('writing...')
		writeFiles(this.documentationFiles)
	}

	exampleRegex(exampleName: string): RegExp {
		return new RegExp(
			`(<!---${exampleName}-->\\s*\`\`\`typescript)(.+?)(\`\`\`)`,
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
