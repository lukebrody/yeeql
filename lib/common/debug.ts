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
	dump() {
		console.log(this.statements.join('\n'))
		this.statements = []
	},
	counter: 0,
	map: new Map(),
	makingSubquery: false,
}
