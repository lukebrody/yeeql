import { defineWorkspace } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineWorkspace([
	'test/**',
	{
		test: {
			pool: 'vmThreads',
			typecheck: {
				enabled: true,
				include: ['**/*.test.ts'],
				tsconfig: 'test/tsconfig.json',
			},
			name: 'type',
			environment: 'jsdom',
			globals: true,
		},
		plugins: [tsconfigPaths()],
	},
	{
		test: {
			pool: 'vmThreads',
			name: 'unit',
			setupFiles: 'vitest.setup.ts',
			environment: 'jsdom',
			globals: true,
		},
		plugins: [tsconfigPaths()],
	},
])
