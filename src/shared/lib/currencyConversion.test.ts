import { describe, it, expect } from 'vitest'
import { convertFromBase, convertToBase } from './currencyConversion'

describe('convertFromBase', () => {
  it('is the identity when rate is 1 (base currency, MYR)', () => {
    expect(convertFromBase(105.54, 1)).toBe(105.54)
  })

  it('converts MYR to a display currency and rounds to 2dp', () => {
    // Verified live 2026-07-28: a catalog item costing 40.85 MYR displayed
    // as $10.00 when the project's exchange rate was 0.24477 (USD).
    expect(convertFromBase(40.85, 0.24477)).toBe(10)
  })

  it('returns 0 for a 0 amount regardless of rate', () => {
    expect(convertFromBase(0, 0.24477)).toBe(0)
  })
})

describe('convertToBase', () => {
  it('is the identity when rate is 1 (base currency, MYR)', () => {
    expect(convertToBase(105.54, 1)).toBe(105.54)
  })

  it('converts a display-currency amount back to MYR and rounds to 2dp', () => {
    // Verified live 2026-07-28: typing 10 (USD) into the add-to-catalog form
    // stored 40.85 MYR, which round-tripped back to exactly $10.00.
    expect(convertToBase(10, 0.24477)).toBe(40.85)
  })
})
