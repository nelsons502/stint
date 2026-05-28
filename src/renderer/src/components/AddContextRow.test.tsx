import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddContextRow } from './AddContextRow'
import { useSettingsStore } from '@renderer/store/settings'
import { DEFAULT_APP_SETTINGS } from '../../../shared/api'

// Mock window.api before each test.
let mockAddContext: ReturnType<typeof vi.fn>

beforeEach(() => {
  // Reset Zustand settings to defaults so newContextStartImmediately is false.
  useSettingsStore.setState(DEFAULT_APP_SETTINGS)

  mockAddContext = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    value: { addContext: mockAddContext },
    configurable: true,
    writable: true
  })
})

describe('AddContextRow — initial render', () => {
  it('renders the name input, recurring checkbox, Add, and Add & Start buttons', () => {
    render(<AddContextRow />)
    expect(screen.getByPlaceholderText('Add a context…')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /keep across days/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add & start/i })).toBeInTheDocument()
  })

  it('has Add and Add & Start buttons disabled when the input is empty', () => {
    render(<AddContextRow />)
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /add & start/i })).toBeDisabled()
  })

  it('defaults the recurring checkbox to unchecked (ad-hoc)', () => {
    render(<AddContextRow />)
    expect(screen.getByRole('checkbox', { name: /keep across days/i })).not.toBeChecked()
  })
})

describe('AddContextRow — typing', () => {
  it('enables Add and Add & Start buttons when a non-empty name is typed', async () => {
    const user = userEvent.setup()
    render(<AddContextRow />)
    await user.type(screen.getByPlaceholderText('Add a context…'), 'My Work')
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /add & start/i })).toBeEnabled()
  })

  it('keeps buttons disabled when only whitespace is entered', async () => {
    const user = userEvent.setup()
    render(<AddContextRow />)
    await user.type(screen.getByPlaceholderText('Add a context…'), '   ')
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /add & start/i })).toBeDisabled()
  })
})

describe('AddContextRow — submitting', () => {
  it('calls api.addContext with trimmed name, isRecurring=false, startImmediately=false on Add', async () => {
    const user = userEvent.setup()
    render(<AddContextRow />)
    await user.type(screen.getByPlaceholderText('Add a context…'), '  Deep Work  ')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(mockAddContext).toHaveBeenCalledOnce())
    expect(mockAddContext).toHaveBeenCalledWith({
      name: 'Deep Work',
      isRecurring: false,
      startImmediately: false
    })
  })

  it('clears the input after a successful add', async () => {
    const user = userEvent.setup()
    render(<AddContextRow />)
    await user.type(screen.getByPlaceholderText('Add a context…'), 'Focus')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Add a context…')).toHaveValue('')
    )
  })

  it('calls api.addContext with startImmediately=true on Add & Start', async () => {
    const user = userEvent.setup()
    render(<AddContextRow />)
    await user.type(screen.getByPlaceholderText('Add a context…'), 'Focus')
    await user.click(screen.getByRole('button', { name: /add & start/i }))
    await waitFor(() => expect(mockAddContext).toHaveBeenCalledOnce())
    expect(mockAddContext).toHaveBeenCalledWith({
      name: 'Focus',
      isRecurring: false,
      startImmediately: true
    })
  })

  it('submits when Enter is pressed in the input field', async () => {
    const user = userEvent.setup()
    render(<AddContextRow />)
    await user.type(screen.getByPlaceholderText('Add a context…'), 'Quick task')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(mockAddContext).toHaveBeenCalledOnce())
  })

  it('does not call api.addContext when the input is empty', async () => {
    const user = userEvent.setup()
    render(<AddContextRow />)
    await user.keyboard('{Enter}')
    expect(mockAddContext).not.toHaveBeenCalled()
  })
})

describe('AddContextRow — recurring checkbox', () => {
  it('passes isRecurring=true when the checkbox is checked', async () => {
    const user = userEvent.setup()
    render(<AddContextRow />)
    await user.click(screen.getByRole('checkbox', { name: /keep across days/i }))
    await user.type(screen.getByPlaceholderText('Add a context…'), 'Standup')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(mockAddContext).toHaveBeenCalledOnce())
    expect(mockAddContext).toHaveBeenCalledWith(
      expect.objectContaining({ isRecurring: true })
    )
  })

  it('toggles checkbox back to false on a second click', async () => {
    const user = userEvent.setup()
    render(<AddContextRow />)
    const checkbox = screen.getByRole('checkbox', { name: /keep across days/i })
    await user.click(checkbox)
    expect(checkbox).toBeChecked()
    await user.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })
})

describe('AddContextRow — busy state', () => {
  it('disables buttons while the IPC call is in flight', async () => {
    let resolve!: () => void
    mockAddContext.mockReturnValue(new Promise<void>((r) => { resolve = r }))
    const user = userEvent.setup()
    render(<AddContextRow />)
    await user.type(screen.getByPlaceholderText('Add a context…'), 'Focus')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    // While in flight, both buttons must be disabled.
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /add & start/i })).toBeDisabled()

    // Resolve the IPC call and verify recovery.
    resolve()
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Add a context…')).toHaveValue('')
    )
  })

  it('re-enables buttons even when the IPC call throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAddContext.mockRejectedValue(new Error('IPC failure'))
    const user = userEvent.setup()
    render(<AddContextRow />)
    await user.type(screen.getByPlaceholderText('Add a context…'), 'Focus')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add & start/i })).toBeEnabled()
    )
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to add context:',
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })
})

describe('AddContextRow — settings integration', () => {
  it('respects newContextStartImmediately=true from settings store on form submit', async () => {
    useSettingsStore.setState({
      ...DEFAULT_APP_SETTINGS,
      newContextStartImmediately: true
    })
    const user = userEvent.setup()
    render(<AddContextRow />)
    await user.type(screen.getByPlaceholderText('Add a context…'), 'Focus')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(mockAddContext).toHaveBeenCalledOnce())
    expect(mockAddContext).toHaveBeenCalledWith(
      expect.objectContaining({ startImmediately: true })
    )
  })
})
