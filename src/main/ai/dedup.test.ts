import { describe, expect, it } from 'vitest'
import { boundingBoxesLikelyMatch, dedupeComponents, dedupeFlags } from './dedup'
import type { ExtractedComponent, ExtractionFlag } from '@shared/types/entities'

function component(overrides: Partial<ExtractedComponent> = {}): ExtractedComponent {
  return {
    description: '63A 3P MCCB',
    qty: 1,
    uom: '',
    tag: '',
    pageNumber: 1,
    panelName: '250A DB-G1',
    componentType: 'MCCB',
    confidence: 0.9,
    notes: '',
    boundingBox: { x: 0.1, y: 0.1, width: 0.1, height: 0.05 },
    ...overrides
  }
}

function flag(overrides: Partial<ExtractionFlag> = {}): ExtractionFlag {
  return {
    pageNumber: 1,
    message: 'Spare provision',
    severity: 'info',
    boundingBox: { x: 0.1, y: 0.1, width: 0.1, height: 0.05 },
    ...overrides
  }
}

describe('boundingBoxesLikelyMatch', () => {
  it('matches identical boxes', () => {
    const box = { x: 0.1, y: 0.1, width: 0.1, height: 0.05 }
    expect(boundingBoxesLikelyMatch(box, { ...box })).toBe(true)
  })

  it('matches boxes with high overlap but not identical', () => {
    const a = { x: 0.1, y: 0.1, width: 0.1, height: 0.1 }
    const b = { x: 0.105, y: 0.105, width: 0.1, height: 0.1 }
    expect(boundingBoxesLikelyMatch(a, b)).toBe(true)
  })

  it('does not match boxes far apart on the page', () => {
    const a = { x: 0.1, y: 0.1, width: 0.05, height: 0.05 }
    const b = { x: 0.8, y: 0.8, width: 0.05, height: 0.05 }
    expect(boundingBoxesLikelyMatch(a, b)).toBe(false)
  })

  it('treats a missing box on either side as neutral (true), not a mismatch', () => {
    const box = { x: 0.1, y: 0.1, width: 0.1, height: 0.05 }
    expect(boundingBoxesLikelyMatch(null, box)).toBe(true)
    expect(boundingBoxesLikelyMatch(box, null)).toBe(true)
    expect(boundingBoxesLikelyMatch(null, null)).toBe(true)
  })
})

describe('dedupeComponents', () => {
  it('drops a candidate matching an existing component by page + box + tag', () => {
    const existing = [component({ tag: 'MCB-3' })]
    const candidates = [component({ tag: 'MCB-3', description: 'differently phrased' })]
    expect(dedupeComponents(existing, candidates)).toEqual([])
  })

  it('drops a candidate matching an existing component by page + box + description when tags are empty', () => {
    const existing = [component({ tag: '' })]
    const candidates = [component({ tag: '' })]
    expect(dedupeComponents(existing, candidates)).toEqual([])
  })

  it('keeps a candidate on a different page even if otherwise identical', () => {
    const existing = [component({ pageNumber: 1 })]
    const candidates = [component({ pageNumber: 2 })]
    expect(dedupeComponents(existing, candidates)).toEqual(candidates)
  })

  it('keeps a candidate whose description and tag both differ from anything existing', () => {
    const existing = [component({ tag: 'MCB-3', description: '63A 3P MCCB' })]
    const candidates = [
      component({
        tag: 'MCB-9',
        description: '32A 1P MCB',
        boundingBox: { x: 0.9, y: 0.9, width: 0.05, height: 0.05 }
      })
    ]
    expect(dedupeComponents(existing, candidates)).toEqual(candidates)
  })
})

describe('dedupeFlags', () => {
  it('drops a candidate matching an existing flag by page + box + message', () => {
    const existing = [flag()]
    const candidates = [flag()]
    expect(dedupeFlags(existing, candidates)).toEqual([])
  })

  it('keeps a candidate with a different message', () => {
    const existing = [flag({ message: 'Spare provision' })]
    const candidates = [flag({ message: 'Illegible rating' })]
    expect(dedupeFlags(existing, candidates)).toEqual(candidates)
  })
})
