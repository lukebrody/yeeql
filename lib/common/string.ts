/* c8 ignore next */
export function compareStrings(a: string, b: string): -1 | 0 | 1 {
	if (a < b) {
		return -1
	} else if (a > b) {
		return 1
	} else {
		return 0
	}
}
