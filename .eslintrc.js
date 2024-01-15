module.exports = {
	env: {
		browser: true,
		es2021: true,
		node: true,
	},
	extends: [
		'eslint:recommended',
		'plugin:react/recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:import/typescript',
		'prettier',
	],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaFeatures: {
			jsx: true,
		},
		ecmaVersion: 'latest',
		sourceType: 'module',
		project: 'tsconfig.lint.json',
	},
	plugins: ['react', '@typescript-eslint'],
	ignorePatterns: ['dist/**/*'],
	rules: {
		indent: ['error', 'tab'],
		'linebreak-style': ['error', 'unix'],
		quotes: ['error', 'single'],
		semi: ['error', 'never'],
		'@typescript-eslint/no-non-null-assertion': 'off',
		'@typescript-eslint/strict-boolean-expressions': 'error',
		'@typescript-eslint/ban-types': [
			'error',
			{
				types: {
					'{}': false,
				},
				extendDefaults: true,
			},
		],
		'no-constant-condition': 'off',
		'no-restricted-imports': [
			'error',
			{
				patterns: ['.*'],
			},
		],
	},
	settings: {
		react: {
			version: 'detect',
		},
	},
	overrides: [
		{
			files: ['lib/**/*'],
			parserOptions: {
				project: 'lib/tsconfig.json',
			},
		},
		{
			files: ['test/**/*'],
			parserOptions: {
				project: 'test/tsconfig.json',
			},
		},
	],
}
