import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
	test: {
		watch: false,
		reporters: ['hanging-process'],
	},
	plugins: [tsconfigPaths()],
})
