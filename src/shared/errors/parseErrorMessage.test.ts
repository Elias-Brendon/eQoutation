import { describe, it, expect } from 'vitest'
import { parseErrorMessage } from './parseErrorMessage'

describe('parseErrorMessage', () => {
  it('extracts a known AppError code and explanation', () => {
    const result = parseErrorMessage('Error AI-001: Anthropic API key not set')
    expect(result).toEqual({ code: 'AI-001', explanation: 'Anthropic API key not set' })
  })

  it('finds the marker even when Electron wraps it with IPC boilerplate', () => {
    const wrapped =
      "Error invoking remote method 'ai:extractSld': AppError: Error AI-001: Anthropic API key not set"
    const result = parseErrorMessage(wrapped)
    expect(result).toEqual({ code: 'AI-001', explanation: 'Anthropic API key not set' })
  })

  it('does not treat an unknown code-shaped substring as a real AppError code', () => {
    const foreign = 'NetworkError: upstream said Error XX-999: not one of ours'
    const result = parseErrorMessage(foreign)
    expect(result).toEqual({ code: null, explanation: foreign })
  })

  it('falls back to the whole message when there is no code marker at all', () => {
    const plain = 'Please enter a SKU before submitting.'
    const result = parseErrorMessage(plain)
    expect(result).toEqual({ code: null, explanation: plain })
  })
})
