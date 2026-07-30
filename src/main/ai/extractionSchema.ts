import type { AnnotationBoundingBox, ExtractedComponent, ExtractionFlag } from '@shared/types/entities'

const boundingBoxJsonSchema = {
  anyOf: [
    {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' }
      },
      required: ['x', 'y', 'width', 'height'],
      additionalProperties: false
    },
    { type: 'null' }
  ],
  description:
    'Approximate bounding box around this item on its page, normalized 0-1 ' +
    '(x/y = top-left corner, width/height as a fraction of the page). Null ' +
    'if no specific region can be identified.'
}

function validateBoundingBox(value: unknown): AnnotationBoundingBox | null {
  const box = value as Partial<AnnotationBoundingBox> | null | undefined
  if (!box || typeof box !== 'object') return null
  const { x, y, width, height } = box
  const nums = [x, y, width, height]
  if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null
  if (x! < 0 || x! > 1 || y! < 0 || y! > 1) return null
  if (width! <= 0 || width! > 1 || height! <= 0 || height! > 1) return null
  return { x: x!, y: y!, width: width!, height: height! }
}

// JSON Schema passed as `output_config.format` on the Messages API — Claude's
// response is constrained to match this shape exactly. `componentType` is
// constrained to the currently-enabled types so it always matches a real key
// in Settings > Components' per-type preferred-brand map.
export function buildExtractionJsonSchema(
  enabledComponentTypes: string[]
): Record<string, unknown> {
  return {
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
            pageNumber: {
              type: 'integer',
              description: '1-based page this component appears on'
            },
            panelName: {
              type: 'string',
              description:
                'The panel/BOM title this component belongs to, formatted as ' +
                '"<incomer rated current> <panel name>" (e.g. "250A DB-G1"). "UNKNOWN" if no ' +
                'dashed bounding box / panel name was found on the page.'
            },
            componentType: {
              type: 'string',
              description:
                'The single best-fitting recognized component type this belongs to (e.g. ' +
                '"MCCB", "Contactor") — used to look up a per-type preferred brand.',
              ...(enabledComponentTypes.length > 0 ? { enum: enabledComponentTypes } : {})
            },
            confidence: { type: 'number', description: 'Extraction confidence from 0 to 1' },
            notes: {
              type: 'string',
              description:
                'Short remarks: incoming source, busbar/cable feed type+size (and whether ' +
                'inferred vs. drawing-stated), spare status, or anything else ambiguous. ' +
                'Empty if none.'
            },
            boundingBox: boundingBoxJsonSchema
          },
          required: [
            'description',
            'qty',
            'uom',
            'tag',
            'pageNumber',
            'panelName',
            'componentType',
            'confidence',
            'notes',
            'boundingBox'
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
            severity: { type: 'string', enum: ['info', 'warning'] },
            boundingBox: boundingBoxJsonSchema
          },
          required: ['pageNumber', 'message', 'severity', 'boundingBox'],
          additionalProperties: false
        }
      }
    },
    required: ['components', 'flags'],
    additionalProperties: false
  }
}

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
      componentType: String(c?.componentType ?? ''),
      confidence: Math.min(1, Math.max(0, Number(c?.confidence) || 0)),
      notes: String(c?.notes ?? ''),
      boundingBox: validateBoundingBox(c?.boundingBox)
    })),
    flags: flags.map((f) => ({
      pageNumber: Number(f?.pageNumber) || 1,
      message: String(f?.message ?? ''),
      severity: f?.severity === 'warning' ? 'warning' : 'info',
      boundingBox: validateBoundingBox(f?.boundingBox)
    }))
  }
}
