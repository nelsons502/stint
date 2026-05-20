// Augments Vitest's `expect` with @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveAttribute, etc.). The runtime augmentation
// happens in src/test/setup.ts; this file makes the types visible to TS.
import '@testing-library/jest-dom/vitest'
