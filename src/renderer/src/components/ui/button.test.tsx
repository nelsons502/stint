import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './button'

describe('Button', () => {
  it('renders its children inside a button element', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('marks the active variant via data-variant', () => {
    render(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveAttribute(
      'data-variant',
      'secondary'
    )
  })

  it('falls back to the default variant when none is passed', () => {
    render(<Button>Default</Button>)
    expect(screen.getByRole('button', { name: 'Default' })).toHaveAttribute(
      'data-variant',
      'default'
    )
  })
})
