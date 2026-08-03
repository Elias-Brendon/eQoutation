# Dynamic AI Model List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `AVAILABLE_AI_MODELS` dropdown source with a real model list fetched from Anthropic, refreshed whenever the user clicks "Test connection" on their saved API key.

**Architecture:** `testAnthropicApiKey()` (main process) changes from a cheap `limit: 1` auth check to a full paginated `models.list()` walk, returning `{ id, label }[]` on success. The `secrets:testApiKey` IPC handler persists that list into a new `AppSettings.cachedAiModels` field and — via a small pure resolver function, unit tested in isolation — resets the selected `aiModel` if it's no longer in the fresh list. The renderer's `AiModelSection` dropdown reads `cachedAiModels ?? AVAILABLE_AI_MODELS`, so it never goes empty even before a key has ever been tested.

**Tech Stack:** `@anthropic-ai/sdk`'s async-iterable pagination (`for await...of client.models.list()`), existing `settingsStore.ts` JSON persistence, existing React Query hook patterns.

## Global Constraints

- No filtering/curation of the fetched models — show everything Anthropic returns, in the order it returns them (newest-first, per the SDK's documented behavior). Source: spec, "Prior decision being revisited."
- The only fetch trigger is the existing "Test connection" button — no fetch-on-Settings-open, no new "Refresh models" button. Source: spec, "Fetch trigger."
- `cachedAiModels: null` (never-tested state) falls back to the existing static `AVAILABLE_AI_MODELS` constant, which stays in the codebase unchanged. Source: spec, "Storage."
- On a successful test, if the currently-stored `aiModel` isn't in the freshly-fetched list, it's silently reset to the newest entry (index 0). Source: spec, "Fetch trigger."
- `DEFAULT_AI_MODEL` is unchanged — still the seed default for a completely fresh install. Source: spec, "Out of scope."

---

### Task 1: Shared types and settings persistence

**Files:**
- Modify: `src/shared/types/entities.ts`
- Modify: `src/main/settings/settingsStore.ts`

**Interfaces:**
- Produces: `AppSettings.cachedAiModels: { id: string; label: string }[] | null` and `TestApiKeyResult.models?: { id: string; label: string }[]` — consumed by Task 2's resolver, Task 3's IPC wiring, and Task 4's UI.

- [ ] **Step 1: Add `cachedAiModels` to `AppSettings`**

In `src/shared/types/entities.ts`, in the `AppSettings` interface, add after `dismissedUpdateVersion: string | null`:

```typescript
  /** Latest model list fetched from Anthropic via "Test connection" — null until a key has ever been tested successfully. */
  cachedAiModels: { id: string; label: string }[] | null
```

- [ ] **Step 2: Add `models` to `TestApiKeyResult`**

In the same file, in the `TestApiKeyResult` interface:

```typescript
export interface TestApiKeyResult {
  ok: boolean
  error?: string
  models?: { id: string; label: string }[]
}
```

- [ ] **Step 3: Wire the field through `settingsStore.ts`**

In `src/main/settings/settingsStore.ts`, in `defaultSettings()`, add after `dismissedUpdateVersion: null`:

```typescript
    dismissedUpdateVersion: null,
    cachedAiModels: null
```

In `getSettings()`'s merge block, add after `dismissedUpdateVersion: parsed.dismissedUpdateVersion ?? defaults.dismissedUpdateVersion`:

```typescript
      dismissedUpdateVersion: parsed.dismissedUpdateVersion ?? defaults.dismissedUpdateVersion,
      cachedAiModels: parsed.cachedAiModels ?? defaults.cachedAiModels
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (this task only adds optional/nullable fields — no existing call site should break).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/entities.ts src/main/settings/settingsStore.ts
git commit -m "feat: add cachedAiModels setting and TestApiKeyResult.models field"
```

---

### Task 2: Pure model-selection resolver (TDD)

**Files:**
- Create: `src/main/settings/aiModelResolver.ts`
- Test: `src/main/settings/aiModelResolver.test.ts`

**Interfaces:**
- Produces: `resolveAiModelForModelList(currentAiModel: string, models: { id: string; label: string }[]): string` — consumed by Task 3's IPC handler.

- [ ] **Step 1: Write the failing test**

`src/main/settings/aiModelResolver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { resolveAiModelForModelList } from './aiModelResolver'

describe('resolveAiModelForModelList', () => {
  it('keeps the current model when it is present in the new list', () => {
    const models = [
      { id: 'claude-opus-5', label: 'Claude Opus 5' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' }
    ]
    expect(resolveAiModelForModelList('claude-sonnet-5', models)).toBe('claude-sonnet-5')
  })

  it('falls back to the newest model when the current one is missing', () => {
    const models = [
      { id: 'claude-opus-5', label: 'Claude Opus 5' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' }
    ]
    expect(resolveAiModelForModelList('claude-legacy-alias', models)).toBe('claude-opus-5')
  })

  it('keeps the current model unchanged when the new list is empty', () => {
    expect(resolveAiModelForModelList('claude-sonnet-5', [])).toBe('claude-sonnet-5')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- aiModelResolver`
Expected: FAIL — `Cannot find module './aiModelResolver'`.

- [ ] **Step 3: Implement the resolver**

`src/main/settings/aiModelResolver.ts`:

```typescript
// After a successful "Test connection", the freshly-fetched model list
// replaces the cached one. If the currently-selected model isn't in that
// list (e.g. the new key doesn't have access to it, or it's been retired),
// fall back to the newest available model (Anthropic returns models
// newest-first) rather than silently leaving extraction pointed at a model
// the current key can't use.
export function resolveAiModelForModelList(
  currentAiModel: string,
  models: { id: string; label: string }[]
): string {
  if (models.some((m) => m.id === currentAiModel)) return currentAiModel
  return models[0]?.id ?? currentAiModel
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- aiModelResolver`
Expected: PASS (3 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/settings/aiModelResolver.ts src/main/settings/aiModelResolver.test.ts
git commit -m "feat: add pure resolver for selecting aiModel after a model-list refresh"
```

---

### Task 3: Fetch the full model list and persist it on a successful test

**Files:**
- Modify: `src/main/ai/ClaudeProvider.ts`
- Modify: `src/main/ipc/secrets.ipc.ts`

**Interfaces:**
- Consumes: `resolveAiModelForModelList` from Task 2; `getSettings`/`updateSettings` from `settingsStore.ts` (existing, unchanged signatures).
- Produces: `testAnthropicApiKey(apiKey: string): Promise<TestApiKeyResult>` now returns `models` on success (existing function, changed return contents only) — consumed by Task 4's renderer wiring (no signature change on the IPC channel itself, so no preload/hook change needed here).

- [ ] **Step 1: Change `testAnthropicApiKey` to fetch the full list**

In `src/main/ai/ClaudeProvider.ts`, replace the current body of `testAnthropicApiKey`:

```typescript
export async function testAnthropicApiKey(apiKey: string): Promise<TestApiKeyResult> {
  try {
    const client = new Anthropic({ apiKey })
    // Listing models is a cheap, zero-generation call — it only checks that
    // the key authenticates, without spending any output tokens. Walking
    // every page (via the SDK's async-iterable pagination) also gives the
    // caller the real, current model list to populate Settings > AI Model.
    const models: { id: string; label: string }[] = []
    for await (const model of client.models.list()) {
      models.push({ id: model.id, label: model.display_name })
    }
    return { ok: true, models }
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: formatErrorCode('AI_RATE_LIMITED') }
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: formatErrorCode('AI_INVALID_API_KEY') }
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return { ok: false, error: formatErrorCode('AI_UNREACHABLE') }
    }
    console.error('[ai:testAnthropicApiKey]', error)
    return { ok: false, error: formatErrorCode('AI_KEY_TEST_FAILED') }
  }
}
```

- [ ] **Step 2: Wire persistence into the IPC handler**

In `src/main/ipc/secrets.ipc.ts`, add imports:

```typescript
import { getSettings, updateSettings } from '../settings/settingsStore'
import { resolveAiModelForModelList } from '../settings/aiModelResolver'
```

Replace the `IPC.secretsTestApiKey` handler:

```typescript
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

- [ ] **Step 3: Run the full test suite and typecheck**

Run: `npm run test:all && npm run typecheck`
Expected: both PASS — this task changes a function whose file has no existing test coverage (`ClaudeProvider.ts` and `secrets.ipc.ts` both make/orchestrate real external API calls and have never had automated tests in this codebase, matching the existing convention for `frankfurterClient.ts` and every other `ipc/*.ts` file) — verified live in Task 4's final step instead.

- [ ] **Step 4: Commit**

```bash
git add src/main/ai/ClaudeProvider.ts src/main/ipc/secrets.ipc.ts
git commit -m "feat: fetch full model list on API key test, persist and auto-reset aiModel"
```

---

### Task 4: Renderer wiring and live verification

**Files:**
- Modify: `src/renderer/src/state/queries/useSecrets.ts`
- Modify: `src/renderer/src/components/settings/sections/AiModelSection.tsx`
- Modify: `src/renderer/src/components/settings/sections/ApiKeysSection.tsx`

**Interfaces:**
- Consumes: `settingsQueryKey` (existing export from `src/renderer/src/state/queries/useSettings.ts`), `AVAILABLE_AI_MODELS` (existing export from `src/shared/constants/aiModels.ts`).

- [ ] **Step 1: Invalidate settings after a successful test**

In `src/renderer/src/state/queries/useSecrets.ts`, add the import:

```typescript
import { settingsQueryKey } from './useSettings'
```

Change `useTestApiKey`:

```typescript
export function useTestApiKey(keyName: SecretKeyName): UseMutationResult<TestApiKeyResult, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (key) => window.api.secrets.testApiKey(keyName, key),
    onSuccess: (result) => {
      if (result.ok && result.models) {
        queryClient.invalidateQueries({ queryKey: settingsQueryKey })
      }
    }
  })
}
```

- [ ] **Step 2: Switch the dropdown source**

In `src/renderer/src/components/settings/sections/AiModelSection.tsx`, change:

```typescript
        <select
          value={settings?.aiModel ?? ''}
          onChange={(e) => updateSettings.mutate({ aiModel: e.target.value })}
          className="h-9 w-full max-w-96 rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          {AVAILABLE_AI_MODELS.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
```

to:

```typescript
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
```

(The `AVAILABLE_AI_MODELS` import stays — it's still the fallback.)

- [ ] **Step 3: Note the model-list refresh in API Keys copy**

In `src/renderer/src/components/settings/sections/ApiKeysSection.tsx`, change the `description` prop passed to `ApiKeyField` in `ApiKeysSection`:

```typescript
      <ApiKeyField
        keyName="anthropicApiKey"
        label="Anthropic API Key"
        description="Your Anthropic API key, used for AI extraction. Stored encrypted at rest via your OS's secure storage — never logged or sent anywhere except Anthropic's API. Testing the connection also refreshes the model list in Settings > AI Model."
        placeholder="sk-ant-…"
      />
```

- [ ] **Step 4: Run typecheck and the full test suite**

Run: `npm run typecheck && npm run test:all`
Expected: both PASS.

- [ ] **Step 5: Live-verify**

Start the app (`npm run dev`), open Settings > API Keys, and with a real Anthropic key saved, click "Test connection." Confirm: the test succeeds, then open Settings > AI Model and confirm the dropdown now lists the real models returned by the account (not just the 3 static entries) — compare against what `client.models.list()` actually returns for this key (e.g. spot-check a couple of IDs look like real Anthropic model IDs, not the old hardcoded `claude-sonnet-5`/`claude-opus-4-8`/`claude-haiku-4-5` short aliases, unless those happen to also be returned). Also confirm the previously-selected model is either still selected (if present in the new list) or the dropdown now shows the newest entry selected (if it wasn't).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/state/queries/useSecrets.ts src/renderer/src/components/settings/sections/AiModelSection.tsx src/renderer/src/components/settings/sections/ApiKeysSection.tsx
git commit -m "feat: use the fetched model list in the AI Model dropdown"
```
