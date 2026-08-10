import { getFlagById, resolveFlag } from '../db/repositories/flagsRepo'
import {
  getQuotationLineById,
  updateQuotationLine,
  applyLineMatch
} from '../db/repositories/quotationsRepo'
import { getAllCatalogItems } from '../db/repositories/catalogRepo'
import { createFeedbackLog, listFeedbackByLine } from '../db/repositories/feedbackLogRepo'
import { resolveAiAnnotation } from '../db/repositories/annotationsRepo'
import { matchComponent } from '../quotation/catalogMatcher'
import { getSettings } from '../settings/settingsStore'
import { resolveEffectivePreferredBrands } from '../settings/preferredBrandResolver'
import { AppError } from '../errors/AppError'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'
import type {
  FeedbackLogEntry,
  FeedbackResolveLineInput,
  QuotationLine
} from '@shared/types/entities'

const FEEDBACK_FIELDS = ['description', 'qty', 'uom', 'tag'] as const

export function registerFeedbackIpc(): void {
  safeHandle(IPC.feedbackResolveLine, (_event, input: FeedbackResolveLineInput): QuotationLine => {
    const line = getQuotationLineById(input.lineId)
    if (!line) throw new AppError('DB_QUOTATION_LINE_NOT_FOUND')

    if (input.action === 'corrected') {
      const before = line
      updateQuotationLine(input.lineId, input.fields ?? {})
      for (const field of FEEDBACK_FIELDS) {
        const newValue = input.fields?.[field]
        if (newValue === undefined) continue
        const oldValue = before[field]
        if (String(oldValue) === String(newValue)) continue
        createFeedbackLog({
          quotationLineId: input.lineId,
          fieldChanged: field,
          aiValue: String(oldValue),
          humanValue: String(newValue),
          action: 'corrected',
          note: input.note
        })
      }

      // The correction may change which catalog item actually fits (or
      // fit at all) — a description/tag edit that was wrong before could
      // now match a different item than whatever it was linked to. Only
      // re-links when a real match clears the threshold; an unmatched
      // line stays exactly as the user typed it otherwise.
      const updatedLine = getQuotationLineById(input.lineId) as QuotationLine
      const catalogItems = getAllCatalogItems()
      const { preferredBrands, preferredBrandsByType } = getSettings()
      const { catalogItem, confidence } = matchComponent(
        {
          description: updatedLine.description,
          qty: updatedLine.qty,
          uom: updatedLine.uom,
          tag: updatedLine.tag,
          pageNumber: updatedLine.pageNumber,
          panelName: updatedLine.panelName,
          componentType: updatedLine.componentType,
          confidence: 0,
          notes: '',
          boundingBox: null
        },
        catalogItems,
        resolveEffectivePreferredBrands(updatedLine.componentType, {
          preferredBrands,
          preferredBrandsByType
        })
      )
      if (catalogItem) {
        applyLineMatch(input.lineId, catalogItem, confidence)
      }
    } else if (input.action === 'accepted') {
      createFeedbackLog({
        quotationLineId: input.lineId,
        fieldChanged: 'description',
        aiValue: line.description,
        humanValue: line.description,
        action: 'accepted',
        note: input.note
      })
    } else {
      createFeedbackLog({
        quotationLineId: input.lineId,
        fieldChanged: 'description',
        aiValue: line.description,
        humanValue: line.description,
        action: 'flagged_for_later',
        note: input.note
      })
    }

    if (input.flagId && input.action !== 'flagged_for_later') {
      if (!getFlagById(input.flagId)) throw new AppError('DB_FLAG_NOT_FOUND')
      resolveFlag(input.flagId, input.note)
      resolveAiAnnotation(input.flagId)
    }

    return getQuotationLineById(input.lineId) as QuotationLine
  })

  safeHandle(IPC.feedbackListByLine, (_event, lineId: string): FeedbackLogEntry[] =>
    listFeedbackByLine(lineId)
  )
}
