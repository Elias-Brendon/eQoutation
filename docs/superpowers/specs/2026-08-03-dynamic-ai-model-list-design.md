# Dynamic AI Model List — Design

**Date:** 2026-08-03
**Status:** Approved
**Context:** User-requested feature (not part of the completed beta-packaging initiative). The AI Model dropdown (`Settings > AI Model`) currently sources from a hardcoded `AVAILABLE_AI_MODELS` constant (3 curated Claude models). The request: pull the real, current model list from Anthropic using the user's saved API key instead.

## Prior decision being revisited

`src/shared/constants/aiModels.ts` has an existing comment explaining why a static list was originally chosen: a live `models.list()` call surfaces every historical/deprecated model Anthropic has ever shipped with no "recommended" signal, and adds a network dependency. This is confirmed still true — the Anthropic SDK's `ModelInfo` type (`id`, `display_name`, `created_at`, `max_input_tokens`/`max_tokens`, capability flags) has no deprecated/recommended flag, only "more recently released models are listed first." The user explicitly wants to move to the dynamic list anyway, accepting that trade-off — confirmed during brainstorming: show everything, newest first, no filtering.

## Storage

`AppSettings` (shared type + `settingsStore.ts`) gains a new nullable field:

```typescript
cachedAiModels: { id: string; label: string }[] | null
```

`null` means "no key has been successfully tested yet" (fresh install, or a key test has never succeeded). In that state, the AI Model dropdown falls back to the existing static `AVAILABLE_AI_MODELS` constant — the dropdown is never empty, and existing installs with `aiModel: 'claude-sonnet-5'` already set keep working exactly as before until the user tests a key.

## Fetch trigger: reuse "Test connection"

No new UI trigger, no automatic fetch on opening Settings > AI Model (rejected during brainstorming — would add a network call + loading state to a page that currently opens instantly, and would refire every time Settings is reopened). Instead, the existing `Settings > API Keys > Test connection` button (already calls Anthropic to verify the key cheaply) does double duty:

- `testAnthropicApiKey()` in `src/main/ai/ClaudeProvider.ts` currently calls `client.models.list({ limit: 1 })` purely to check auth. It changes to fetch the **full** model list via the SDK's auto-pagination (`for await` over the `PagePromise`, since Anthropic returns models newest-first with no documented total count upfront — a single `limit: 1` call is cheap but a full list needs to walk all pages).
- `TestApiKeyResult` (shared type) gains an optional field: `models?: { id: string; label: string }[]` — `label` is the model's `display_name` verbatim, `id` is its `id`. Present only on a successful test.
- The `secrets:testApiKey` IPC handler, on a successful result that includes `models`, persists them into `settings.cachedAiModels` via the existing `updateSettings()` — and if the currently-stored `aiModel` is not present in the new list, resets `aiModel` to the newest entry (index 0 — confirmed newest-first) as part of the same update. This is the auto-reset behavior confirmed during brainstorming: a key swap that drops today's model can never leave extraction silently pointed at a model the current key can't use.

`ApiKeysSection.tsx` gets one added line of copy near the Test connection button noting that testing also refreshes the available models list.

## UI

`AiModelSection.tsx`'s dropdown source changes from `AVAILABLE_AI_MODELS` to `settings?.cachedAiModels ?? AVAILABLE_AI_MODELS`. No other UI changes — same `<select>`, same `updateSettings.mutate({ aiModel: ... })` on change.

## Out of scope

- Any filtering/curation of the returned models — the user explicitly chose "show everything, newest first."
- Any change to the fetch trigger beyond "Test connection" (no fetch-on-Settings-open, no dedicated "Refresh models" button).
- Any change to `DEFAULT_AI_MODEL` — still the seed default written by `defaultSettings()` for a completely fresh install before any key has ever been tested.
- Removing `AVAILABLE_AI_MODELS` — it stays as the fallback constant for the `cachedAiModels === null` state.
