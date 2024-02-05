import { DefaultMap } from 'common/DefaultMap'
import replace from 'replace-in-file'
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

export class UpdateDocs {
	documentationFiles: string
	testFiles: string
	indent: string

	constructor({
		documentationFiles = '**/*.md',
		testFiles = 'test/docs/**/*.tsx',
		indent = '  ',
	} = {}) {
		this.documentationFiles = documentationFiles
		this.testFiles = testFiles
		this.indent = indent
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

		for (const file of globSync(this.testFiles)) {
			const fileContents = fs.readFileSync(file).toString()
			for (const [, indent, exampleName, code] of fileContents.matchAll(
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
		replace.sync({
			files: this.documentationFiles,
			from: pattern,
			to: (...args) => {
				const [, header, exampleName, , end] = args as string[]
				return [header, examples.get(exampleName).join('\n'), end].join('\n')
			},
		})
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
		replace.sync({
			files: this.documentationFiles,
			from: pattern,
			to: (...args) => {
				const [, header, content, end] = args as string[]
				count += Array.from(content.matchAll(token as RegExp)).length
				const replacedContent = content.replaceAll(token, stringValue)
				return [header, replacedContent, end].join('')
			},
		})
		if (count !== 1) {
			throw new Error(`token ${token} appeared ${count} times`)
		}
	}
}
