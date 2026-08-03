import { describe, it, expect } from 'vitest'
import { computeRenderScale } from './pdfRenderer'

describe('computeRenderScale', () => {
  it('scales a portrait page so its height (the long edge) hits the target', () => {
    // A4 portrait in PDF points: 595 x 842
    const scale = computeRenderScale(595, 842, 1568)
    expect(scale).toBeCloseTo(1568 / 842, 5)
  })

  it('scales a landscape page so its width (the long edge) hits the target', () => {
    // A4 landscape: 842 x 595
    const scale = computeRenderScale(842, 595, 1568)
    expect(scale).toBeCloseTo(1568 / 842, 5)
  })

  it('scales a square page consistently off either dimension', () => {
    const scale = computeRenderScale(1000, 1000, 1568)
    expect(scale).toBeCloseTo(1.568, 5)
  })
})
