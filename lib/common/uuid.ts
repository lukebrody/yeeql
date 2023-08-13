import Base256 from 'base256-encoding'

export type UUID = string & { __requestId: true } // 8 bytes

const length = 8

const result = {
	create(): UUID {
		const result = new Uint8Array(length)
		crypto.getRandomValues(result)
		return Base256.encode(result) as UUID
	},
	length,
	encode(uuid: UUID): Uint8Array {
		return Base256.decode(uuid)
	},
	decode(data: Uint8Array): UUID {
		const string = Base256.encode(data)
		if (string.length !== length) {
			throw new Error(`Encoded UUID of length ${string.length} was unexpected. Expected length is ${length}`)
		}
		return string as UUID
	}
}

export const UUID: Readonly<typeof result> = result