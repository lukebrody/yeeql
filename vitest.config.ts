import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		coverage: {
			enabled: true,
			cleanOnRerun: false,
		},
	},
})
