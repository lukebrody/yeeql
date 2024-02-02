import { UUID } from 'common/UUID'

export const debug: {
	statements: string[]
	dump: () => void
	on: boolean
	counter: number
	map: Map<UUID, number>
	makingSubquery: boolean
} = {
	on: false,
	statements: [],
	/* v8 ignore start */
	dump() {
		console.log(this.statements.join('\n'))
		this.statements = []
	},
	/* v8 ignore stop */
	counter: 0,
	map: new Map(),
	makingSubquery: false,
}
