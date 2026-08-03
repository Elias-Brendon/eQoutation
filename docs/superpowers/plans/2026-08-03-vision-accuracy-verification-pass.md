# Vision Accuracy Improvement, Part 2: Self-Verification Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, internal Claude call to `ClaudeProvider.extractComponents()` that reviews the same rendered page images plus the draft extraction, appending anything it finds missing or inconsistent — without ever editing or replacing what the first pass already produced.

**Architecture:** `extractionSchema.ts` gets refactored to expose its component/flag item schemas and normalization logic as reusable functions, then gains a second, smaller schema + normalizer for the verification response shape (`missedComponents`/`additionalFlags`). `promptTemplates.ts` gains a verification prompt that wraps the existing extraction prompt (reusing all its business rules) with a review-and-append task framing plus the serialized draft. `ClaudeProvider.ts` makes the second call after the first succeeds, merges its output additively, and never fails the overall extraction if the second call itself fails.

**Tech Stack:** Same as part 1 — `@anthropic-ai/sdk`'s streaming Messages API with `output_config.format: { type: 'json_schema' }`.

## Global Constraints

- Verification only ever **appends** to the draft's `components`/`flags` arrays — it never edits or removes anything the first pass produced. Source: spec, "Response shape and merge strategy."
- If the verification call fails for any reason, log it and return the draft-only result — never fail the overall extraction because of it. Source: spec, "Failure handling."
- Verification reuses the exact same rendered page images from the first pass — no re-rendering. Source: spec, "Where it lives."
- Verification's token usage is summed into the same `usage` object `extractComponents` already returns. Source: spec, "Cost and progress."
- Always runs — no Settings toggle, no user-facing way to disable it in this plan. Source: spec, "Out of scope."
- No visual distinction between pass-1 and verification-added components/flags in the UI — this plan touches no renderer/UI files at all. Source: spec, "Out of scope."

---

### Task 1: Refactor `extractionSchema.ts` for reuse

**Files:**
- Modify: `src/main/ai/extractionSchema.ts`
- Modify: `src/main/ai/extractionSchema.test.ts`

**Interfaces:**
- Produces: `buildComponentItemSchema(enabledComponentTypes: string[]): Record<string, unknown>`, `buildFlagItemSchema(): Record<string, unknown>`, `normalizeComponent(raw: unknown): ExtractedComponent`, `normalizeFlag(raw: unknown): ExtractionFlag` — consumed by Task 2's verification schema/normalizer and by this task's own refactored `buildExtractionJsonSchema`/`normalizeExtractionPayload`.

- [ ] **Step 1: Write failing tests for the newly-exposed functions**

Add to `src/main/ai/extractionSchema.test.ts` (new `describe` blocks, after the existing one):

```typescript
import { normalizeComponent, normalizeFlag } from './extractionSchema'

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- extractionSchema`
Expected: FAIL — `normalizeComponent`/`normalizeFlag` are not exported yet.

- [ ] **Step 3: Refactor the implementation**

Replace the full contents of `src/main/ai/extractionSchema.ts` with:

```typescript
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

// `componentType` is constrained to the currently-enabled types so it
// always matches a real key in Settings > Components' per-type preferred-
// brand map. Shared by the draft extraction schema and the verification
// schema (Task 2) — a missed component still needs the same shape.
export function buildComponentItemSchema(enabledComponentTypes: string[]): Record<string, unknown> {
  return {
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
}

export function buildFlagItemSchema(): Record<string, unknown> {
  return {
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

// JSON Schema passed as `output_config.format` on the Messages API — Claude's
// response is constrained to match this shape exactly.
export function buildExtractionJsonSchema(
  enabledComponentTypes: string[]
): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      components: { type: 'array', items: buildComponentItemSchema(enabledComponentTypes) },
      flags: { type: 'array', items: buildFlagItemSchema() }
    },
    required: ['components', 'flags'],
    additionalProperties: false
  }
}

// Defensive normalization: the schema constrains Claude's output, but we
// don't trust field types blindly (e.g. qty arriving as a numeric string).
export function normalizeComponent(raw: unknown): ExtractedComponent {
  const c = raw as Partial<ExtractedComponent> | null | undefined
  return {
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
  }
}

export function normalizeFlag(raw: unknown): ExtractionFlag {
  const f = raw as Partial<ExtractionFlag> | null | undefined
  return {
    pageNumber: Number(f?.pageNumber) || 1,
    message: String(f?.message ?? ''),
    severity: f?.severity === 'warning' ? 'warning' : 'info',
    boundingBox: validateBoundingBox(f?.boundingBox)
  }
}

interface RawExtractionPayload {
  components: ExtractedComponent[]
  flags: ExtractionFlag[]
}

export function normalizeExtractionPayload(parsed: unknown): RawExtractionPayload {
  const obj = parsed as Partial<RawExtractionPayload> | null
  const components = Array.isArray(obj?.components) ? obj.components : []
  const flags = Array.isArray(obj?.flags) ? obj.flags : []

  return {
    components: components.map(normalizeComponent),
    flags: flags.map(normalizeFlag)
  }
}
```

- [ ] **Step 4: Run all extractionSchema tests to verify they pass**

Run: `npm run test -- extractionSchema`
Expected: PASS (existing boundingBox tests + the 3 new tests from Step 1, all green — confirms the refactor didn't change behavior).

- [ ] **Step 5: Commit**

```bash
git add src/main/ai/extractionSchema.ts src/main/ai/extractionSchema.test.ts
git commit -m "refactor: extract reusable component/flag schema and normalization helpers"
```

---

### Task 2: Verification response schema and normalizer (TDD)

**Files:**
- Modify: `src/main/ai/extractionSchema.ts`
- Modify: `src/main/ai/extractionSchema.test.ts`

**Interfaces:**
- Consumes: `buildComponentItemSchema`, `buildFlagItemSchema`, `normalizeComponent`, `normalizeFlag` from Task 1.
- Produces: `buildVerificationJsonSchema(enabledComponentTypes: string[]): Record<string, unknown>`, `normalizeVerificationPayload(parsed: unknown): { missedComponents: ExtractedComponent[]; additionalFlags: ExtractionFlag[] }` — consumed by Task 4's `ClaudeProvider.ts` wiring.

- [ ] **Step 1: Write the failing test**

Add to `src/main/ai/extractionSchema.test.ts`:

```typescript
import { normalizeVerificationPayload } from './extractionSchema'

describe('normalizeVerificationPayload', () => {
  it('normalizes missedComponents and additionalFlags the same way as the draft payload', () => {
    const result = normalizeVerificationPayload({
      missedComponents: [{ description: 'Missed MCB', confidence: 0.8 }],
      additionalFlags: [{ message: 'Inconsistent rating', severity: 'warning', pageNumber: 2 }]
    })
    expect(result.missedComponents).toHaveLength(1)
    expect(result.missedComponents[0].description).toBe('Missed MCB')
    expect(result.missedComponents[0].confidence).toBe(0.8)
    expect(result.additionalFlags).toHaveLength(1)
    expect(result.additionalFlags[0].message).toBe('Inconsistent rating')
    expect(result.additionalFlags[0].severity).toBe('warning')
  })

  it('returns empty arrays when the payload has neither field', () => {
    const result = normalizeVerificationPayload({})
    expect(result.missedComponents).toEqual([])
    expect(result.additionalFlags).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- extractionSchema`
Expected: FAIL — `normalizeVerificationPayload` is not exported yet.

- [ ] **Step 3: Implement**

Add to the end of `src/main/ai/extractionSchema.ts`:

```typescript
// Verification pass response: only what pass 1 might have missed or gotten
// inconsistent — never a full replacement list. See
// docs/superpowers/specs/2026-08-03-vision-accuracy-verification-pass-design.md.
export function buildVerificationJsonSchema(
  enabledComponentTypes: string[]
): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      missedComponents: { type: 'array', items: buildComponentItemSchema(enabledComponentTypes) },
      additionalFlags: { type: 'array', items: buildFlagItemSchema() }
    },
    required: ['missedComponents', 'additionalFlags'],
    additionalProperties: false
  }
}

interface RawVerificationPayload {
  missedComponents: ExtractedComponent[]
  additionalFlags: ExtractionFlag[]
}

export function normalizeVerificationPayload(parsed: unknown): RawVerificationPayload {
  const obj = parsed as Partial<RawVerificationPayload> | null
  const missedComponents = Array.isArray(obj?.missedComponents) ? obj.missedComponents : []
  const additionalFlags = Array.isArray(obj?.additionalFlags) ? obj.additionalFlags : []

  return {
    missedComponents: missedComponents.map(normalizeComponent),
    additionalFlags: additionalFlags.map(normalizeFlag)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- extractionSchema`
Expected: PASS (all extractionSchema tests, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/main/ai/extractionSchema.ts src/main/ai/extractionSchema.test.ts
git commit -m "feat: add verification response schema and normalizer"
```

---

### Task 3: Verification prompt

**Files:**
- Modify: `src/main/ai/promptTemplates.ts`

**Interfaces:**
- Consumes: `buildExtractionSystemPrompt` (existing, unchanged signature, same file).
- Produces: `buildVerificationSystemPrompt(enabledComponentTypes: string[], catalogDescriptions: string[], preferredBrands: string[], customRules: string[], draftComponents: ExtractedComponent[], draftFlags: ExtractionFlag[]): string` — consumed by Task 4's `ClaudeProvider.ts` wiring.

- [ ] **Step 1: Add the import**

At the top of `src/main/ai/promptTemplates.ts`, add:

```typescript
import type { ExtractedComponent, ExtractionFlag } from '@shared/types/entities'
```

- [ ] **Step 2: Add the function**

Append to the end of `src/main/ai/promptTemplates.ts`:

```typescript
export function buildVerificationSystemPrompt(
  enabledComponentTypes: string[],
  catalogDescriptions: string[],
  preferredBrands: string[],
  customRules: string[],
  draftComponents: ExtractedComponent[],
  draftFlags: ExtractionFlag[]
): string {
  const extractionRules = buildExtractionSystemPrompt(
    enabledComponentTypes,
    catalogDescriptions,
    preferredBrands,
    customRules
  )

  const draftSummary = draftComponents.length
    ? draftComponents
        .map(
          (c) =>
            `- [Page ${c.pageNumber}, ${c.panelName}] ${c.description}${c.tag ? ` (tag: ${c.tag})` : ''}`
        )
        .join('\n')
    : '(none)'

  const flagSummary = draftFlags.length
    ? draftFlags.map((f) => `- [Page ${f.pageNumber}] ${f.message}`).join('\n')
    : '(none)'

  return `You are reviewing a first-pass BOM extraction from the same Single Line
Diagram page images, to catch anything the first pass missed or got
inconsistent. You are NOT re-extracting from scratch — the list below is
already correct and complete unless you find a specific, concrete problem
with it.

## What was already extracted

${draftSummary}

## What was already flagged

${flagSummary}

## Your task

1. Look through every page image again for any component that is visible
   on the drawing but is NOT in the list above. For each one you find, add
   it to \`missedComponents\`, following the exact same description
   formatting, component-type recognition, and business rules below as the
   first pass used — a missed component still needs to follow every rule
   (breaker formatting, cable sizing, PFR expansion, etc.).
2. Look for any item already in the list above whose rating looks
   internally inconsistent with what's shown on its page (e.g. a noted
   cable size that doesn't match a stated busbar/cable choice, a pole
   count that doesn't match the breaker type). Do NOT edit the original
   list — instead, add an \`additionalFlags\` entry describing the
   inconsistency so a human can resolve it.
3. If you find nothing to add in either category, return empty arrays for
   both. Do not invent problems to report — only real, specific ones.

## Reference: the same rules the first pass followed

${extractionRules}

Respond only with the structured verification result — no prose.`
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/ai/promptTemplates.ts
git commit -m "feat: add verification system prompt, reusing the draft extraction's rules"
```

---

### Task 4: Wire the verification pass into `ClaudeProvider.extractComponents`

**Files:**
- Modify: `src/main/ai/ClaudeProvider.ts`

**Interfaces:**
- Consumes: `buildVerificationJsonSchema`, `normalizeVerificationPayload` from Task 2; `buildVerificationSystemPrompt` from Task 3.

- [ ] **Step 1: Add the imports**

In `src/main/ai/ClaudeProvider.ts`, change:

```typescript
import { buildExtractionJsonSchema, normalizeExtractionPayload } from './extractionSchema'
import { buildExtractionSystemPrompt } from './promptTemplates'
```

to:

```typescript
import {
  buildExtractionJsonSchema,
  buildVerificationJsonSchema,
  normalizeExtractionPayload,
  normalizeVerificationPayload
} from './extractionSchema'
import { buildExtractionSystemPrompt, buildVerificationSystemPrompt } from './promptTemplates'
```

- [ ] **Step 2: Replace the end of `extractComponents` to add the verification call**

Replace from `onProgress?.({ pct: 92, stage: 'Parsing response' })` through the end of the method (the closing `}` of `extractComponents`, right before the class's closing `}`) with:

```typescript
    onProgress?.({ pct: 92, stage: 'Parsing response' })

    if (message.stop_reason === 'max_tokens') {
      throw new AppError('AI_EXTRACTION_TRUNCATED', {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens
      })
    }

    const textBlock = message.content.find(
      (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
    )
    if (!textBlock) {
      throw new AppError('AI_RESPONSE_UNREADABLE', {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens
      })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(textBlock.text)
    } catch {
      throw new AppError('AI_RESPONSE_UNREADABLE', {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens
      })
    }
    const { components, flags } = normalizeExtractionPayload(parsed)

    let totalUsage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens
    }

    onProgress?.({ pct: 95, stage: 'Verifying' })

    try {
      const verificationStream = this.client.messages.stream({
        model: this.model,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'disabled' },
        system: buildVerificationSystemPrompt(
          enabledComponentTypes,
          catalogDescriptions,
          preferredBrands,
          customRules,
          components,
          flags
        ),
        messages: [
          {
            role: 'user',
            content: [
              ...pageContentBlocks,
              {
                type: 'text',
                text: 'Review the page images against the already-extracted list as described in the system prompt.'
              }
            ]
          }
        ],
        output_config: {
          format: { type: 'json_schema', schema: buildVerificationJsonSchema(enabledComponentTypes) }
        }
      })
      const verificationMessage = await verificationStream.finalMessage()
      totalUsage = {
        inputTokens: totalUsage.inputTokens + verificationMessage.usage.input_tokens,
        outputTokens: totalUsage.outputTokens + verificationMessage.usage.output_tokens
      }

      const verificationTextBlock = verificationMessage.content.find(
        (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
      )
      if (verificationTextBlock) {
        const verificationParsed = JSON.parse(verificationTextBlock.text)
        const { missedComponents, additionalFlags } = normalizeVerificationPayload(verificationParsed)
        components.push(...missedComponents)
        flags.push(...additionalFlags)
      }
    } catch (error) {
      // Verification is an accuracy enhancement, not a hard requirement —
      // a failure here must never waste an already-successful first pass.
      console.error('[ai:verifyExtraction]', error)
    }

    onProgress?.({ pct: 100, stage: 'Done' })

    return {
      model: this.model,
      components,
      flags,
      usage: totalUsage
    }
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test:all`
Expected: PASS — this task has no automated test of its own (matches this codebase's existing convention: `ClaudeProvider.ts` makes real external API calls and has never had direct test coverage; the logic it now calls — schema building and normalization — is already covered by Tasks 1–2's tests). This is a regression check.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: no new errors in the files this plan touches (pre-existing repo-wide warnings are expected and unrelated).

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/ClaudeProvider.ts
git commit -m "feat: add self-verification pass to catch missed components and inconsistent ratings"
```

- [ ] **Step 7: Live-verify (requires the user)**

This plan cannot be fully verified without a real Anthropic API key and a real SLD PDF — neither of which should be handled directly in an automated/agentic way (the key is a live credential; touching it programmatically to self-test is out of bounds regardless of read-only intent). Ask the user to:
1. Run a real extraction and confirm a new "Verifying" progress stage appears before completion.
2. Check whether previously-missed components now show up, and whether any new flags appear for inconsistent ratings.
3. Confirm total token usage reported for the extraction reflects two calls' worth (noticeably higher than part 1 alone, but not doubled unless the draft list was very large).
