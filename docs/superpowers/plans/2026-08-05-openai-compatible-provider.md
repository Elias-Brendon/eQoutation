# OpenAI-Compatible AI Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second AI provider — configurable via API key + base URL + free-text model name — covering any backend that speaks the OpenAI-compatible chat-completions API (OpenAI itself, Qwen, Grok, local servers like Ollama/LM Studio).

**Architecture:** A new `OpenAiCompatibleProvider` implements the existing provider-agnostic `AIProvider` interface, reusing the PDF rendering, prompt building, and JSON schema/parsing logic `ClaudeProvider` already uses (all already provider-agnostic). Single-pass extraction only (no self-verification pass), non-streaming, using the official `openai` npm package with a custom `baseURL`. Three places that currently hardcode "there is only one provider" as an assumption become real branches: `ai.ipc.ts`'s provider factory, `secrets.ipc.ts`'s key-test handler, and `errorCodes.ts`'s Anthropic-worded AI error messages.

**Tech Stack:** TypeScript, `openai` npm package (new dependency, v7), React, TanStack Query.

## Global Constraints

- Single-pass extraction for the new provider — no verification pass. Claude's existing 2-pass pipeline is untouched.
- Non-streaming for the new provider (`chat.completions.create` awaited directly, no stream consumption).
- Global setting (`AppSettings.aiProvider`), not per-project.
- Model name for the new provider is free text — no curated list, no dynamic `models.list()` caching (unlike the Anthropic path's cached model list).
- `strict: true` is attempted first for structured output; if live verification finds it's rejected by a real backend, that's a finding to act on then, not something pre-solved here.
- No renderer tests, no unit/dbtest for the new provider or its test-connection function — matches this codebase's existing convention that live-API-calling/SDK-wrapping files (`ClaudeProvider.ts`, every `ipc/*.ts` file) are live-verified, not mocked (zero `vi.mock()` usage anywhere in this project).

Every task's requirements implicitly include this section. Full rationale: `docs/superpowers/specs/2026-08-05-openai-compatible-provider-design.md`.

---

### Task 1: Settings & secrets model

**Files:**
- Modify: `src/shared/types/entities.ts`
- Modify: `src/main/settings/settingsStore.ts`
- Modify: `src/main/settings/secretsStore.ts`
- Modify: `src/shared/errors/errorCodes.ts`

**Interfaces:**
- Produces: `AppSettings.aiProvider: 'anthropic' | 'openai-compatible'`, `AppSettings.openaiCompatibleBaseUrl: string`, `AppSettings.openaiCompatibleModel: string`; `SecretKeyName = 'anthropicApiKey' | 'openaiCompatibleApiKey'`; provider-neutral wording for `AI_NO_API_KEY`, `AI_UNREACHABLE`, `AI_RATE_LIMITED`, `AI_INVALID_API_KEY`, `AI_KEY_TEST_FAILED`.

No automated tests for this task — `settingsStore.ts`/`secretsStore.ts` have none today (real file I/O + `Electron app.getPath`, same class of module as `ClaudeProvider.ts` that's live-verified only). Verify via typecheck + full regression + Task 5's live check.

- [ ] **Step 1: Extend `SecretKeyName` and `AppSettings` in `entities.ts`**

Find:

```ts
export type SecretKeyName = 'anthropicApiKey'
```

Replace with:

```ts
export type SecretKeyName = 'anthropicApiKey' | 'openaiCompatibleApiKey'
```

Find the `AppSettings` interface and add three fields after `aiModel: string`:

```ts
  aiModel: string
  aiProvider: 'anthropic' | 'openai-compatible'
  openaiCompatibleBaseUrl: string
  openaiCompatibleModel: string
```

- [ ] **Step 2: Update `settingsStore.ts`'s defaults and merge logic**

In `defaultSettings()`, add after `aiModel: DEFAULT_AI_MODEL,`:

```ts
    aiModel: DEFAULT_AI_MODEL,
    aiProvider: 'anthropic',
    openaiCompatibleBaseUrl: '',
    openaiCompatibleModel: '',
```

In `getSettings()`'s field-by-field merge (the object literal built from `parsed`), add after `aiModel: parsed.aiModel ?? defaults.aiModel,`:

```ts
      aiModel: parsed.aiModel ?? defaults.aiModel,
      aiProvider: parsed.aiProvider ?? defaults.aiProvider,
      openaiCompatibleBaseUrl: parsed.openaiCompatibleBaseUrl ?? defaults.openaiCompatibleBaseUrl,
      openaiCompatibleModel: parsed.openaiCompatibleModel ?? defaults.openaiCompatibleModel,
```

- [ ] **Step 3: Add the new key to `secretsStore.ts`'s `DEV_ENV_FALLBACK`**

`DEV_ENV_FALLBACK` is typed `Record<SecretKeyName, string>` — extending the union in Step 1 means this object now needs an entry for the new key or the file won't typecheck. Find:

```ts
const DEV_ENV_FALLBACK: Record<SecretKeyName, string> = {
  anthropicApiKey: 'ANTHROPIC_API_KEY'
}
```

Replace with:

```ts
const DEV_ENV_FALLBACK: Record<SecretKeyName, string> = {
  anthropicApiKey: 'ANTHROPIC_API_KEY',
  openaiCompatibleApiKey: 'OPENAI_COMPATIBLE_API_KEY'
}
```

(No new named helper functions like `getOpenAiCompatibleApiKey` — the existing `setAnthropicApiKey`/`getMaskedAnthropicApiKey` convenience wrappers are already unused outside this file; everything actually consumed elsewhere goes through the generic `getSecret`/`setSecret`/`getMaskedSecret`, which already work for any `SecretKeyName` including the new one with zero changes.)

- [ ] **Step 4: Make the AI error messages provider-neutral in `errorCodes.ts`**

Find:

```ts
  AI_NO_API_KEY: { code: 'AI-001', message: 'Anthropic API key not set' },
  AI_UNREACHABLE: { code: 'AI-002', message: 'Anthropic unreachable' },
  AI_RATE_LIMITED: { code: 'AI-003', message: 'Anthropic rate limited' },
  AI_INVALID_API_KEY: { code: 'AI-004', message: 'Anthropic API key rejected' },
```

Replace with:

```ts
  AI_NO_API_KEY: { code: 'AI-001', message: 'AI API key not set' },
  AI_UNREACHABLE: { code: 'AI-002', message: 'AI provider unreachable' },
  AI_RATE_LIMITED: { code: 'AI-003', message: 'AI provider rate limited' },
  AI_INVALID_API_KEY: { code: 'AI-004', message: 'AI API key rejected' },
```

Find:

```ts
  AI_KEY_TEST_FAILED: { code: 'AI-008', message: 'Anthropic key test failed' },
```

Replace with:

```ts
  AI_KEY_TEST_FAILED: { code: 'AI-008', message: 'AI key test failed' },
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: errors in every file that constructs a `SecretsFile`/`Record<SecretKeyName, ...>` without the new key, or an `AppSettings` object missing the three new fields — fix any that surface beyond the files already touched above (there shouldn't be any, since `getSettings()`/`defaultSettings()` are the only two places that construct a full `AppSettings` object).

- [ ] **Step 6: Run the full test suite (regression check)**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/entities.ts src/main/settings/settingsStore.ts src/main/settings/secretsStore.ts src/shared/errors/errorCodes.ts
git commit -m "feat: add settings/secrets model for a second AI provider"
```

---

### Task 2: `OpenAiCompatibleProvider` implementation

**Files:**
- Modify: `package.json` (new dependency)
- Create: `src/main/ai/OpenAiCompatibleProvider.ts`

**Interfaces:**
- Consumes: `AIProvider`, `ExtractParams`, `ExtractionResult` from `./AIProvider`; `buildExtractionJsonSchema`, `normalizeExtractionPayload` from `./extractionSchema`; `buildExtractionSystemPrompt` from `./promptTemplates`; `renderPdfPagesToImages` from `./pdfRenderer`; `AppError` from `../errors/AppError`; `formatErrorCode` from `@shared/errors/errorCodes`; `TestApiKeyResult` from `@shared/types/entities`.
- Produces: `export class OpenAiCompatibleProvider implements AIProvider`; `export async function testOpenAiCompatibleApiKey(apiKey: string, baseUrl: string): Promise<TestApiKeyResult>`.

- [ ] **Step 1: Add the `openai` dependency**

Run: `npm install openai@^7.4.0`
Expected: `package.json`/`package-lock.json` updated, install succeeds.

- [ ] **Step 2: Create `OpenAiCompatibleProvider.ts`**

```ts
import OpenAI from 'openai'
import type { AIProvider, ExtractParams, ExtractionResult } from './AIProvider'
import { buildExtractionJsonSchema, normalizeExtractionPayload } from './extractionSchema'
import { buildExtractionSystemPrompt } from './promptTemplates'
import { renderPdfPagesToImages } from './pdfRenderer'
import { AppError } from '../errors/AppError'
import { formatErrorCode } from '@shared/errors/errorCodes'
import type { TestApiKeyResult } from '@shared/types/entities'

// Same budget as ClaudeProvider, same reason: dense multi-page SLDs (many
// components + notes + flags) can need well more than a few thousand
// output tokens — too low a budget truncates the JSON mid-string instead
// of raising a clear error, regardless of which provider is answering.
// Non-streaming means a large response here risks an HTTP timeout against
// a slow backend — a known, accepted limitation of this first pass, not
// something worked around by capping the budget instead (that would just
// trade a timeout risk for a truncation risk).
const MAX_TOKENS = 64000

const PROGRESS_TICK_MS = 400
const PROGRESS_TICK_CAP = 90

export class OpenAiCompatibleProvider implements AIProvider {
  private client: OpenAI
  private model: string

  constructor(apiKey: string, baseUrl: string, model: string) {
    this.client = new OpenAI({ apiKey, baseURL: baseUrl })
    this.model = model
  }

  async extractComponents({
    pdfBytes,
    enabledComponentTypes,
    catalogDescriptions,
    preferredBrands,
    customRules,
    onProgress
  }: ExtractParams): Promise<ExtractionResult> {
    onProgress?.({ pct: 5, stage: 'Reading PDF' })

    onProgress?.({ pct: 10, stage: 'Rendering pages' })
    let pages: { pageNumber: number; base64Png: string }[]
    try {
      pages = await renderPdfPagesToImages(pdfBytes)
    } catch (error) {
      console.error('[ai:openaiCompatible:renderPdfPagesToImages]', error)
      throw new AppError('AI_PAGE_RENDER_FAILED')
    }

    onProgress?.({ pct: 15, stage: 'Sending to model' })

    let pct = 20
    const ticker = setInterval(() => {
      pct = Math.min(PROGRESS_TICK_CAP, pct + 3)
      onProgress?.({ pct, stage: 'Analyzing diagram' })
    }, PROGRESS_TICK_MS)

    const pageContentBlocks = pages.flatMap(
      (page): OpenAI.Chat.Completions.ChatCompletionContentPart[] => [
        { type: 'text', text: `Page ${page.pageNumber}` },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${page.base64Png}` } }
      ]
    )

    let completion: OpenAI.Chat.Completions.ChatCompletion
    try {
      completion = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        messages: [
          {
            role: 'system',
            content: buildExtractionSystemPrompt(
              enabledComponentTypes,
              catalogDescriptions,
              preferredBrands,
              customRules
            )
          },
          {
            role: 'user',
            content: [
              ...pageContentBlocks,
              {
                type: 'text',
                text: 'Extract every component from this switchboard SLD as described in the system prompt.'
              }
            ]
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'sld_extraction',
            schema: buildExtractionJsonSchema(enabledComponentTypes),
            strict: true
          }
        }
      })
    } catch (error) {
      if (error instanceof OpenAI.RateLimitError) throw new AppError('AI_RATE_LIMITED')
      if (error instanceof OpenAI.AuthenticationError) throw new AppError('AI_INVALID_API_KEY')
      if (error instanceof OpenAI.APIConnectionError) throw new AppError('AI_UNREACHABLE')
      console.error('[ai:openaiCompatible:extractComponents]', error)
      throw new AppError('AI_REQUEST_FAILED')
    } finally {
      clearInterval(ticker)
    }

    onProgress?.({ pct: 92, stage: 'Parsing response' })

    const usage = {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0
    }

    if (completion.choices[0]?.finish_reason === 'length') {
      throw new AppError('AI_EXTRACTION_TRUNCATED', usage)
    }

    const text = completion.choices[0]?.message?.content
    if (!text) {
      throw new AppError('AI_RESPONSE_UNREADABLE', usage)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new AppError('AI_RESPONSE_UNREADABLE', usage)
    }
    const { components, flags } = normalizeExtractionPayload(parsed)

    onProgress?.({ pct: 100, stage: 'Done' })

    return {
      model: this.model,
      components,
      flags,
      usage
    }
  }
}

export async function testOpenAiCompatibleApiKey(
  apiKey: string,
  baseUrl: string
): Promise<TestApiKeyResult> {
  try {
    const client = new OpenAI({ apiKey, baseURL: baseUrl })
    // Cheap, zero-generation call — only checks that the key/endpoint
    // authenticate. Unlike the Anthropic path, results aren't cached or
    // shown anywhere (this provider's model field is free text).
    await client.models.list()
    return { ok: true }
  } catch (error) {
    if (error instanceof OpenAI.RateLimitError) {
      return { ok: false, error: formatErrorCode('AI_RATE_LIMITED') }
    }
    if (error instanceof OpenAI.AuthenticationError) {
      return { ok: false, error: formatErrorCode('AI_INVALID_API_KEY') }
    }
    if (error instanceof OpenAI.APIConnectionError) {
      return { ok: false, error: formatErrorCode('AI_UNREACHABLE') }
    }
    console.error('[ai:testOpenAiCompatibleApiKey]', error)
    return { ok: false, error: formatErrorCode('AI_KEY_TEST_FAILED') }
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. If `OpenAI.RateLimitError`/`OpenAI.AuthenticationError`/`OpenAI.APIConnectionError`/`OpenAI.Chat.Completions.ChatCompletionContentPart`/`OpenAI.Chat.Completions.ChatCompletion` aren't the exact export names in the installed `openai` v7 package, TypeScript will report exactly which ones — fix the import/type names to whatever the package actually exports (the SDK is generated by the same tool as `@anthropic-ai/sdk`, so the same error-class naming pattern is expected, but confirm against the real installed types rather than assuming). Also confirm `max_tokens` is accepted by the request type — some newer OpenAI model generations use `max_completion_tokens` instead; if TypeScript rejects `max_tokens`, switch to whichever the installed SDK's request type actually expects.

- [ ] **Step 4: Run the full test suite (regression check)**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/main/ai/OpenAiCompatibleProvider.ts
git commit -m "feat: add OpenAiCompatibleProvider (single-pass, non-streaming)"
```

---

### Task 3: Wiring — provider factory and key-test branching

**Files:**
- Modify: `src/main/ipc/ai.ipc.ts`
- Modify: `src/main/ipc/secrets.ipc.ts`

**Interfaces:**
- Consumes: `OpenAiCompatibleProvider`, `testOpenAiCompatibleApiKey` from `../ai/OpenAiCompatibleProvider` (Task 2).

- [ ] **Step 1: Branch `ai.ipc.ts`'s provider factory**

Find:

```ts
import { ClaudeProvider } from '../ai/ClaudeProvider'
import type { AIProvider, ExtractionResult } from '../ai/AIProvider'
import { getSettings } from '../settings/settingsStore'
import { getAnthropicApiKey } from '../settings/secretsStore'
```

Replace with:

```ts
import { ClaudeProvider } from '../ai/ClaudeProvider'
import { OpenAiCompatibleProvider } from '../ai/OpenAiCompatibleProvider'
import type { AIProvider, ExtractionResult } from '../ai/AIProvider'
import { getSettings } from '../settings/settingsStore'
import { getAnthropicApiKey, getSecret } from '../settings/secretsStore'
```

Find:

```ts
let provider: AIProvider | null = null
let providerCacheKey: string | null = null

function getProvider(effectiveModel: string): AIProvider {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    throw new AppError('AI_NO_API_KEY')
  }
  const cacheKey = `${apiKey}:${effectiveModel}`
  if (!provider || providerCacheKey !== cacheKey) {
    provider = new ClaudeProvider(apiKey, effectiveModel)
    providerCacheKey = cacheKey
  }
  return provider
}
```

Replace with:

```ts
let provider: AIProvider | null = null
let providerCacheKey: string | null = null

function getProvider(effectiveModel: string): AIProvider {
  const { aiProvider, openaiCompatibleBaseUrl, openaiCompatibleModel } = getSettings()

  if (aiProvider === 'openai-compatible') {
    const apiKey = getSecret('openaiCompatibleApiKey')
    if (!apiKey) throw new AppError('AI_NO_API_KEY')
    const cacheKey = `openai-compatible:${apiKey}:${openaiCompatibleBaseUrl}:${openaiCompatibleModel}`
    if (!provider || providerCacheKey !== cacheKey) {
      provider = new OpenAiCompatibleProvider(apiKey, openaiCompatibleBaseUrl, openaiCompatibleModel)
      providerCacheKey = cacheKey
    }
    return provider
  }

  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    throw new AppError('AI_NO_API_KEY')
  }
  const cacheKey = `anthropic:${apiKey}:${effectiveModel}`
  if (!provider || providerCacheKey !== cacheKey) {
    provider = new ClaudeProvider(apiKey, effectiveModel)
    providerCacheKey = cacheKey
  }
  return provider
}
```

(Note the `anthropic:`/`openai-compatible:` cache-key prefixes — this is what makes switching providers correctly invalidate a cached instance built for the other one, even if the rest of the key parts happened to collide.)

- [ ] **Step 2: Branch `secrets.ipc.ts`'s key-test handler**

Find:

```ts
import { deleteSecret, getMaskedSecret, setSecret } from '../settings/secretsStore'
import { testAnthropicApiKey } from '../ai/ClaudeProvider'
import { getSettings, updateSettings } from '../settings/settingsStore'
```

Replace with:

```ts
import { deleteSecret, getMaskedSecret, setSecret } from '../settings/secretsStore'
import { testAnthropicApiKey } from '../ai/ClaudeProvider'
import { testOpenAiCompatibleApiKey } from '../ai/OpenAiCompatibleProvider'
import { getSettings, updateSettings } from '../settings/settingsStore'
```

Find:

```ts
  safeHandle(
    IPC.secretsTestApiKey,
    async (_event, _keyName: SecretKeyName, key: string): Promise<TestApiKeyResult> => {
      const result = await testAnthropicApiKey(key)
      if (result.ok && result.models) {
        const currentAiModel = getSettings().aiModel
        updateSettings({
          cachedAiModels: result.models,
          aiModel: resolveAiModelForModelList(currentAiModel, result.models)
        })
      }
      return result
    }
  )
```

Replace with:

```ts
  safeHandle(
    IPC.secretsTestApiKey,
    async (_event, keyName: SecretKeyName, key: string): Promise<TestApiKeyResult> => {
      if (keyName === 'openaiCompatibleApiKey') {
        return testOpenAiCompatibleApiKey(key, getSettings().openaiCompatibleBaseUrl)
      }

      const result = await testAnthropicApiKey(key)
      if (result.ok && result.models) {
        const currentAiModel = getSettings().aiModel
        updateSettings({
          cachedAiModels: result.models,
          aiModel: resolveAiModelForModelList(currentAiModel, result.models)
        })
      }
      return result
    }
  )
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Run the full test suite (regression check)**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/ai.ipc.ts src/main/ipc/secrets.ipc.ts
git commit -m "feat: wire OpenAiCompatibleProvider into the extraction and key-test paths"
```

---

### Task 4: Settings UI

**Files:**
- Modify: `src/renderer/src/components/settings/sections/AiModelSection.tsx`
- Modify: `src/renderer/src/components/settings/sections/ApiKeysSection.tsx`

**Interfaces:**
- Consumes: `settings.aiProvider`, `settings.openaiCompatibleBaseUrl`, `settings.openaiCompatibleModel` (Task 1); `useApiKeyMasked`/`useSetApiKey`/`useTestApiKey`/`useDeleteApiKey` (already generic over `keyName`, unchanged).

- [ ] **Step 1: Add the provider dropdown and conditional fields to `AiModelSection.tsx`**

Replace the full contents:

```tsx
import { useSettings, useUpdateSettings } from '@renderer/state/queries/useSettings'
import { Input } from '@renderer/components/common/Input'
import { AVAILABLE_AI_MODELS } from '@shared/constants/aiModels'
import type { AppSettings } from '@shared/types/entities'

export function AiModelSection(): React.JSX.Element {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">AI Model</h3>
        <p className="mt-1 text-xs text-text-secondary">
          Which AI provider and model run BOM extraction, and how uncertain results are handled.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-text-secondary">Provider</label>
        <select
          value={settings?.aiProvider ?? 'anthropic'}
          onChange={(e) =>
            updateSettings.mutate({ aiProvider: e.target.value as AppSettings['aiProvider'] })
          }
          className="h-9 w-full max-w-96 rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai-compatible">OpenAI-compatible (OpenAI, Qwen, Grok, local, …)</option>
        </select>
      </div>

      {settings?.aiProvider === 'openai-compatible' ? (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
              Base URL
            </label>
            <Input
              value={settings.openaiCompatibleBaseUrl}
              onChange={(e) => updateSettings.mutate({ openaiCompatibleBaseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="max-w-96"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-text-secondary">Model</label>
            <Input
              value={settings.openaiCompatibleModel}
              onChange={(e) => updateSettings.mutate({ openaiCompatibleModel: e.target.value })}
              placeholder="gpt-5, qwen-vl-max, …"
              className="max-w-96"
            />
          </div>
        </>
      ) : (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-text-secondary">Model</label>
          <select
            value={settings?.aiModel ?? ''}
            onChange={(e) => updateSettings.mutate({ aiModel: e.target.value })}
            className="h-9 w-full max-w-96 rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            {(settings?.cachedAiModels ?? AVAILABLE_AI_MODELS).map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
          Confidence threshold ({((settings?.confidenceThreshold ?? 0.7) * 100).toFixed(0)}%)
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings?.confidenceThreshold ?? 0.7}
          onChange={(e) => updateSettings.mutate({ confidenceThreshold: Number(e.target.value) })}
          className="w-full max-w-96 accent-accent"
        />
        <p className="mt-1 text-xs text-text-muted">
          Extracted lines below this confidence get flagged for review.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
          Max retries on failure
        </label>
        <select
          value={settings?.maxExtractionRetries ?? 0}
          onChange={(e) =>
            updateSettings.mutate({ maxExtractionRetries: Number(e.target.value) })
          }
          className="h-9 w-24 rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          {[0, 1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-text-muted">
          Automatically retries a failed extraction call this many extra times before giving up.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Make `ApiKeysSection.tsx` provider-aware**

Replace the full contents:

```tsx
import { useState } from 'react'
import { Input } from '@renderer/components/common/Input'
import { Button } from '@renderer/components/common/Button'
import { useSettings } from '@renderer/state/queries/useSettings'
import {
  useApiKeyMasked,
  useDeleteApiKey,
  useSetApiKey,
  useTestApiKey
} from '@renderer/state/queries/useSecrets'
import type { SecretKeyName } from '@shared/types/entities'

export function ApiKeysSection(): React.JSX.Element {
  const { data: settings } = useSettings()

  return (
    <div className="flex flex-col gap-6">
      {settings?.aiProvider === 'openai-compatible' ? (
        <ApiKeyField
          keyName="openaiCompatibleApiKey"
          label="OpenAI-Compatible API Key"
          description="Your API key for the provider configured in Settings > AI Model (OpenAI, Qwen, Grok, or a local server). Stored encrypted at rest via your OS's secure storage — never logged or sent anywhere except that provider's endpoint."
          placeholder="sk-…"
        />
      ) : (
        <ApiKeyField
          keyName="anthropicApiKey"
          label="Anthropic API Key"
          description="Your Anthropic API key, used for AI extraction. Stored encrypted at rest via your OS's secure storage — never logged or sent anywhere except Anthropic's API. Testing the connection also refreshes the model list in Settings > AI Model."
          placeholder="sk-ant-…"
        />
      )}
    </div>
  )
}

interface ApiKeyFieldProps {
  keyName: SecretKeyName
  label: string
  description: string
  placeholder: string
}

function ApiKeyField({ keyName, label, description, placeholder }: ApiKeyFieldProps): React.JSX.Element {
  const { data: maskedKey } = useApiKeyMasked(keyName)
  const setApiKey = useSetApiKey(keyName)
  const testApiKey = useTestApiKey(keyName)
  const deleteApiKey = useDeleteApiKey(keyName)
  const [candidateKey, setCandidateKey] = useState('')
  const [savedJustNow, setSavedJustNow] = useState(false)

  const handleSave = (): void => {
    setSavedJustNow(false)
    setApiKey.mutate(candidateKey, {
      onSuccess: () => {
        setCandidateKey('')
        setSavedJustNow(true)
      }
    })
  }

  const handleTest = (): void => {
    testApiKey.mutate(candidateKey)
  }

  const handleDelete = (): void => {
    setSavedJustNow(false)
    deleteApiKey.mutate()
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
      <p className="text-xs text-text-secondary">{description}</p>
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-secondary">
        <span>
          Current key: <span className="font-mono text-text-primary">{maskedKey ?? 'none set'}</span>
        </span>
        {maskedKey && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleteApiKey.isPending}
          >
            {deleteApiKey.isPending ? 'Deleting…' : 'Delete key'}
          </Button>
        )}
      </div>
      <Input
        type="password"
        placeholder={placeholder}
        value={candidateKey}
        onChange={(e) => setCandidateKey(e.target.value)}
        className="max-w-80"
      />
      {testApiKey.data && (
        <p className={`text-xs ${testApiKey.data.ok ? 'text-success' : 'text-danger'}`}>
          {testApiKey.data.ok ? 'Connection succeeded.' : testApiKey.data.error}
        </p>
      )}
      {savedJustNow && setApiKey.isSuccess && <p className="text-xs text-success">Key saved.</p>}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={!candidateKey.trim() || testApiKey.isPending}
        >
          {testApiKey.isPending ? 'Testing…' : 'Test connection'}
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={handleSave}
          disabled={!candidateKey.trim() || setApiKey.isPending}
        >
          {setApiKey.isPending ? 'Saving…' : 'Save key'}
        </Button>
      </div>
    </div>
  )
}
```

(This is the same `ApiKeyField` component as before, unchanged — only the top-level `ApiKeysSection` export changed, to pick which key it renders based on `settings.aiProvider`.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Run the full test suite (regression check)**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/settings/sections/AiModelSection.tsx src/renderer/src/components/settings/sections/ApiKeysSection.tsx
git commit -m "feat: add provider selection and OpenAI-compatible fields to Settings"
```

---

### Task 5: Full regression and live verification

**Files:** none (verification only).

- [ ] **Step 1: Full automated regression**

Run: `npm run test:all`
Expected: PASS (both Node and Electron/DB suites).

- [ ] **Step 2: Build and launch check**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run dev`
Expected: launches without a startup crash.

- [ ] **Step 3: Live verification (cannot be automated — ask the user)**

This one needs a real OpenAI-compatible API key + endpoint from the user (their own OpenAI key is the simplest option to test with first). Ask them to, in the running app:

1. In Settings > AI Model, switch Provider to "OpenAI-compatible", set a base URL (e.g. `https://api.openai.com/v1` for real OpenAI) and a model name (e.g. `gpt-4o` or another vision-capable model).
2. In Settings > API Keys, enter their key for that provider and click "Test connection" — confirm it succeeds, and confirm the error message (if the key is deliberately wrong) is provider-neutral, not "Anthropic API key rejected".
3. Run a real extraction on an SLD and confirm it completes and produces a sensible result — note: if `strict: true` structured output is rejected by the backend, this is exactly the scenario flagged as an open technical unknown in the spec; report back what error surfaces so the fallback (`strict: false`) can be added as a fast follow-up if needed.
4. Switch the provider back to Anthropic and confirm extraction still works there too (proves the provider cache-key fix in Task 3 actually invalidates correctly on switch, not just once).

- [ ] **Step 4: Update project memory**

Once the user confirms results (or reports what broke against a real backend), update the `project-post-beta-feedback-backlog` memory — this is the last item on that backlog, so note whether it's now fully closed or whether a `strict: false` fallback (or other finding from Step 3) is a follow-up still needed.
