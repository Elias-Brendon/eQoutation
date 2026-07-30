import { describe, it, expect } from 'vitest'
import { matchComponent } from './catalogMatcher'
import type { CatalogItem, ExtractedComponent } from '@shared/types/entities'

function catalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'item-1',
    sku: 'SKU-1',
    description: 'generic item',
    maker: 'GENERIC',
    family: '',
    series: '',
    listPrice: 100,
    discountFactor: 1,
    unitPrice: 100,
    uom: 'PC',
    sourceRow: 1,
    updatedAt: new Date().toISOString(),
    ...overrides
  }
}

function extractedComponent(overrides: Partial<ExtractedComponent> = {}): ExtractedComponent {
  return {
    description: 'generic component',
    qty: 1,
    uom: 'PC',
    tag: '',
    pageNumber: 1,
    panelName: 'MDB',
    componentType: 'MCB',
    confidence: 0.9,
    notes: '',
    boundingBox: null,
    ...overrides
  }
}

describe('matchComponent', () => {
  it('matches exactly by tag/SKU regardless of description, with full confidence', () => {
    const item = catalogItem({ id: 'exact', sku: 'A9N61500' })
    const component = extractedComponent({
      tag: 'a9n61500',
      description: 'completely different text'
    })
    const result = matchComponent(component, [item])
    expect(result).toEqual({ catalogItem: item, confidence: 1 })
  })

  it('matches by normalized description overlap when no tag match exists', () => {
    const item = catalogItem({ id: 'overlap', description: '40A 3P 10kA MCCB' })
    const component = extractedComponent({ tag: '', description: '40A 3P 10kA MCCB' })
    const result = matchComponent(component, [item])
    expect(result.catalogItem).toEqual(item)
    expect(result.confidence).toBe(1)
  })

  it('leaves a component unmatched when no catalog item clears the threshold', () => {
    const item = catalogItem({ id: 'unrelated', description: 'CAPACITOR BANK 25kvar 525V' })
    const component = extractedComponent({ tag: '', description: 'DIGITAL POWER METER' })
    const result = matchComponent(component, [item])
    expect(result.catalogItem).toBeNull()
  })

  it('prefers a preferred-brand match over a higher-scoring non-preferred one, when it clears the threshold', () => {
    const preferred = catalogItem({
      id: 'pref',
      maker: 'ABB',
      description: '40A 3P 10kA MCCB, older style variant'
    })
    const other = catalogItem({ id: 'other', maker: 'SCHNEIDER', description: '40A 3P 10kA MCCB' })
    const component = extractedComponent({ tag: '', description: '40A 3P 10kA MCCB' })
    const result = matchComponent(component, [preferred, other], ['ABB'])
    expect(result.catalogItem?.id).toBe('pref')
  })

  it('falls back to the best match from any brand if the preferred brand has nothing above threshold', () => {
    const preferred = catalogItem({ id: 'pref', maker: 'ABB', description: 'totally unrelated text' })
    const other = catalogItem({ id: 'other', maker: 'SCHNEIDER', description: '40A 3P 10kA MCCB' })
    const component = extractedComponent({ tag: '', description: '40A 3P 10kA MCCB' })
    const result = matchComponent(component, [preferred, other], ['ABB'])
    expect(result.catalogItem?.id).toBe('other')
  })
})
