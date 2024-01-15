import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
	test: {
		pool: 'forks',
		watch: false,
		root: '../',
	},
	plugins: [tsconfigPaths()],
})
