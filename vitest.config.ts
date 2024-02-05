import { defineConfig } from 'vitest/config'
// eslint-disable-next-line no-restricted-imports
import { docs } from './docs'

export default defineConfig({
	test: {
		coverage: {
			enabled: true,
		},
		reporters: [
			'default',
			{
				async onFinished() {
					docs.write()
				},
				async onPathsCollected() {
					docs.read()
					docs.updateExamples()
				},
			},
		],
	},
})
