import { defineConfig } from 'vite'

export default defineConfig({
	test: {
		setupFiles: [
			'./vite.setup.ts'
		]
	}
})