// mulberry32, seeded so failures reproduce
export function seededRandom(seed: number) {
	let state = seed
	const random = () => {
		state = (state + 0x6d2b79f5) | 0
		let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
	}
	const int = (max: number) => Math.floor(random() * max)
	return {
		random,
		int,
		pick: <T>(items: readonly T[]): T => items[int(items.length)],
	}
}
