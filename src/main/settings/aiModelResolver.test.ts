import { describe, it, expect } from 'vitest'
import { resolveAiModelForModelList } from './aiModelResolver'

describe('resolveAiModelForModelList', () => {
  it('keeps the current model when it is present in the new list', () => {
    const models = [
      { id: 'claude-opus-5', label: 'Claude Opus 5' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' }
    ]
    expect(resolveAiModelForModelList('claude-sonnet-5', models)).toBe('claude-sonnet-5')
  })

  it('falls back to the newest model when the current one is missing', () => {
    const models = [
      { id: 'claude-opus-5', label: 'Claude Opus 5' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' }
    ]
    expect(resolveAiModelForModelList('claude-legacy-alias', models)).toBe('claude-opus-5')
  })

  it('keeps the current model unchanged when the new list is empty', () => {
    expect(resolveAiModelForModelList('claude-sonnet-5', [])).toBe('claude-sonnet-5')
  })
})
