import { describe, it, expect } from 'vitest'
import { computeCropPixelRect, computeRenderScale, isValidPanelBox, MIN_CROP_BOX_FRACTION } from './pdfRenderer'

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

describe('isValidPanelBox', () => {
  it('accepts a normal-sized panel box', () => {
    expect(isValidPanelBox({ x: 0.1, y: 0.1, width: 0.3, height: 0.2 })).toBe(true)
  })

  it('rejects a box narrower than MIN_CROP_BOX_FRACTION', () => {
    expect(isValidPanelBox({ x: 0.1, y: 0.1, width: MIN_CROP_BOX_FRACTION / 2, height: 0.2 })).toBe(false)
  })

  it('rejects a box shorter than MIN_CROP_BOX_FRACTION', () => {
    expect(isValidPanelBox({ x: 0.1, y: 0.1, width: 0.2, height: MIN_CROP_BOX_FRACTION / 2 })).toBe(false)
  })

  it('accepts a box exactly at the MIN_CROP_BOX_FRACTION boundary', () => {
    expect(isValidPanelBox({ x: 0.1, y: 0.1, width: MIN_CROP_BOX_FRACTION, height: MIN_CROP_BOX_FRACTION })).toBe(true)
  })
})

describe('computeCropPixelRect', () => {
  it('computes the pixel rect for a panel box at a given page size and scale', () => {
    // A4 portrait at scale 2 (points -> px): page becomes 1190 x 1684
    const rect = computeCropPixelRect(595, 842, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, 2)
    expect(rect).toEqual({
      x: 0.1 * 595 * 2,
      y: 0.2 * 842 * 2,
      width: 0.3 * 595 * 2,
      height: 0.4 * 842 * 2
    })
  })

  it('produces a rect matching the full page when the box covers it entirely', () => {
    const rect = computeCropPixelRect(595, 842, { x: 0, y: 0, width: 1, height: 1 }, 1)
    expect(rect).toEqual({ x: 0, y: 0, width: 595, height: 842 })
  })
})
