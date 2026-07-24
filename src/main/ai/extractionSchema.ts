import type { ExtractedComponent, ExtractionFlag } from '@shared/types/entities'

// JSON Schema passed as `output_config.format` on the Messages API — Claude's
// response is constrained to match this shape exactly.
export const extractionJsonSchema = {
  type: 'object',
  properties: {
    components: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'What the component is, e.g. "63A 3P MCCB" or "Digital power meter"'
          },
          qty: { type: 'number', description: 'Count of this exact component, default 1' },
          uom: {
            type: 'string',
            description: 'Unit of measure, e.g. "nos", "m". Empty if unknown.'
          },
          tag: {
            type: 'string',
            description: 'Visible tag/label reference, e.g. "MCB-3". Empty if none.'
          },
          pageNumber: { type: 'integer', description: '1-based page this component appears on' },
          panelName: {
            type: 'string',
            description:
              'The panel/BOM title this component belongs to, formatted as ' +
              '"<incomer rated current> <panel name>" (e.g. "250A DB-G1"). "UNKNOWN" if no ' +
              'dashed bounding box / panel name was found on the page.'
          },
          confidence: { type: 'number', description: 'Extraction confidence from 0 to 1' },
          notes: {
            type: 'string',
            description:
              'Short remarks: incoming source, busbar/cable feed type+size (and whether ' +
              'inferred vs. drawing-stated), spare/future status, or anything else ambiguous. ' +
              'Empty if none.'
          }
        },
        required: [
          'description',
          'qty',
          'uom',
          'tag',
          'pageNumber',
          'panelName',
          'confidence',
          'notes'
        ],
        additionalProperties: false
      }
    },
    flags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pageNumber: { type: 'integer' },
          message: { type: 'string' },
          severity: { type: 'string', enum: ['info', 'warning'] }
        },
        required: ['pageNumber', 'message', 'severity'],
        additionalProperties: false
      }
    }
  },
  required: ['components', 'flags'],
  additionalProperties: false
} as const

interface RawExtractionPayload {
  components: ExtractedComponent[]
  flags: ExtractionFlag[]
}

// Defensive normalization: the schema constrains Claude's output, but we
// don't trust field types blindly (e.g. qty arriving as a numeric string).
export function normalizeExtractionPayload(parsed: unknown): RawExtractionPayload {
  const obj = parsed as Partial<RawExtractionPayload> | null
  const components = Array.isArray(obj?.components) ? obj.components : []
  const flags = Array.isArray(obj?.flags) ? obj.flags : []

  return {
    components: components.map((c) => ({
      description: String(c?.description ?? ''),
      qty: Number(c?.qty) || 1,
      uom: String(c?.uom ?? ''),
      tag: String(c?.tag ?? ''),
      pageNumber: Number(c?.pageNumber) || 1,
      panelName: String(c?.panelName ?? '').trim() || 'UNKNOWN',
      confidence: Math.min(1, Math.max(0, Number(c?.confidence) || 0)),
      notes: String(c?.notes ?? '')
    })),
    flags: flags.map((f) => ({
      pageNumber: Number(f?.pageNumber) || 1,
      message: String(f?.message ?? ''),
      severity: f?.severity === 'warning' ? 'warning' : 'info'
    }))
  }
}
