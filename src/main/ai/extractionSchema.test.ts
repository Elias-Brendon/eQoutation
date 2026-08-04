import { describe, expect, it } from 'vitest'
import { normalizeExtractionPayload, normalizeComponent, normalizeFlag } from './extractionSchema'

describe('normalizeExtractionPayload boundingBox handling', () => {
  it('passes through a valid boundingBox on a component', () => {
    const result = normalizeExtractionPayload({
      components: [
        {
          description: 'MCCB',
          qty: 1,
          uom: '',
          tag: '',
          pageNumber: 1,
          panelName: 'UNKNOWN',
          componentType: 'MCCB',
          confidence: 0.9,
          notes: '',
          boundingBox: { x: 0.1, y: 0.2, width: 0.05, height: 0.03 }
        }
      ],
      flags: []
    })
    expect(result.components[0].boundingBox).toEqual({ x: 0.1, y: 0.2, width: 0.05, height: 0.03 })
  })

  it('normalizes a missing boundingBox to null', () => {
    const result = normalizeExtractionPayload({
      components: [
        {
          description: 'MCCB',
          qty: 1,
          uom: '',
          tag: '',
          pageNumber: 1,
          panelName: 'UNKNOWN',
          componentType: 'MCCB',
          confidence: 0.9,
          notes: ''
        }
      ],
      flags: []
    })
    expect(result.components[0].boundingBox).toBeNull()
  })

  it('rejects a boundingBox with out-of-range or non-numeric fields as null', () => {
    const result = normalizeExtractionPayload({
      components: [
        {
          description: 'MCCB',
          qty: 1,
          uom: '',
          tag: '',
          pageNumber: 1,
          panelName: 'UNKNOWN',
          componentType: 'MCCB',
          confidence: 0.9,
          notes: '',
          boundingBox: { x: 1.5, y: 0.2, width: 0.05, height: 0.03 }
        }
      ],
      flags: []
    })
    expect(result.components[0].boundingBox).toBeNull()
  })

  it('passes through a valid boundingBox on a flag, and null-normalizes an invalid one', () => {
    const result = normalizeExtractionPayload({
      components: [],
      flags: [
        { pageNumber: 1, message: 'ok', severity: 'info', boundingBox: { x: 0, y: 0, width: 0.2, height: 0.1 } },
        { pageNumber: 1, message: 'bad', severity: 'info', boundingBox: { x: 0, y: 0, width: -1, height: 0.1 } }
      ]
    })
    expect(result.flags[0].boundingBox).toEqual({ x: 0, y: 0, width: 0.2, height: 0.1 })
    expect(result.flags[1].boundingBox).toBeNull()
  })
})

describe('normalizeComponent', () => {
  it('fills in defaults for a minimal input', () => {
    const result = normalizeComponent({ description: 'MCCB' })
    expect(result).toEqual({
      description: 'MCCB',
      qty: 1,
      uom: '',
      tag: '',
      pageNumber: 1,
      panelName: 'UNKNOWN',
      componentType: '',
      confidence: 0,
      notes: '',
      boundingBox: null
    })
  })

  it('clamps confidence to the 0-1 range', () => {
    expect(normalizeComponent({ confidence: 5 }).confidence).toBe(1)
    expect(normalizeComponent({ confidence: -2 }).confidence).toBe(0)
  })
})

describe('normalizeFlag', () => {
  it('defaults severity to info for anything other than warning', () => {
    expect(normalizeFlag({ message: 'x', severity: 'danger' }).severity).toBe('info')
    expect(normalizeFlag({ message: 'x', severity: 'warning' }).severity).toBe('warning')
  })
})
