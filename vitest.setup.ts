import { expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
// eslint-disable-next-line no-restricted-imports
import { UpdateDocs } from './test/docs/updateDocs'

expect.extend(matchers)

afterEach(() => {
	cleanup()
})

new UpdateDocs().updateExamples()
