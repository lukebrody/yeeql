import { defineWorkspace } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineWorkspace([
	'test/**',
	{
		test: {
			pool: 'vmThreads',
			typecheck: {
				only: true,
				enabled: true,
				include: ['**/*.tsx', '**/*.ts'],
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
			globalSetup: 'vitest.global.setup.ts',
			environment: 'jsdom',
			globals: true,
		},
		plugins: [tsconfigPaths()],
	},
])
