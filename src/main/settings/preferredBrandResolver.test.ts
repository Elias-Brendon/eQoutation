import { describe, it, expect } from 'vitest'
import { resolveEffectivePreferredBrands } from './preferredBrandResolver'

describe('resolveEffectivePreferredBrands', () => {
  it('returns the per-type override when one is set for this component type', () => {
    const result = resolveEffectivePreferredBrands('MCCB', {
      preferredBrands: ['SCHNEIDER'],
      preferredBrandsByType: { MCCB: 'ABB' }
    })
    expect(result).toEqual(['ABB'])
  })

  it('falls back to the global preferred-brands list when no per-type override exists', () => {
    const result = resolveEffectivePreferredBrands('Contactor', {
      preferredBrands: ['SCHNEIDER'],
      preferredBrandsByType: { MCCB: 'ABB' }
    })
    expect(result).toEqual(['SCHNEIDER'])
  })

  it('returns an empty list when nothing is configured', () => {
    const result = resolveEffectivePreferredBrands('MCCB', {
      preferredBrands: [],
      preferredBrandsByType: {}
    })
    expect(result).toEqual([])
  })
})
