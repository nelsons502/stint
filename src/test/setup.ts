import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// React Testing Library auto-cleans between tests when globals are on; we
// keep `globals: false` for clearer imports, so do the cleanup explicitly.
afterEach(() => {
  cleanup()
})
