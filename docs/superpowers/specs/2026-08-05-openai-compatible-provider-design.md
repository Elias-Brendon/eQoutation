# OpenAI-Compatible AI Provider — Design

**Date:** 2026-08-05
**Status:** Approved
**Context:** Last remaining item on the post-beta feedback backlog (`project_post_beta_feedback_backlog` memory). User wants multi-provider support — not a fixed second vendor, but "depends on the user's API key provider" (OpenAI, Qwen, Grok, local/self-hosted models all named). Decomposed in brainstorming: most of those (OpenAI, Qwen, Grok, Ollama/LM Studio-style local servers) speak the same OpenAI-compatible chat-completions wire format, so one new provider implementation with a configurable base URL covers all of them. Gemini (a genuinely different API shape) is explicitly deferred to a later pass once this pattern is proven.

## Scope for this pass

- One new provider: `OpenAiCompatibleProvider`, configurable via API key + base URL + free-text model name.
- **Single-pass extraction only** — no self-verification pass (Claude's 2-pass pipeline is untouched and stays Anthropic-only). Third-party/local backends have unknown, inconsistent support for vision and strict structured output; proving the single call works reliably comes before doubling the integration surface.
- **Non-streaming.** Claude's provider streams specifically to avoid HTTP timeouts at very large output sizes; this first cut accepts the risk of a slow/large extraction timing out against an unpredictable backend rather than add streaming complexity up front. Known limitation, not hidden — the natural follow-up if it matters in practice.
- Global setting, not per-project — matches how the API key and current Claude model selection are already global, not per-project.
- No dynamic model-list fetch/caching for this provider (unlike Anthropic's cached-model-list feature) — the model name is free text the user types in, since there's no fixed catalog of models across arbitrary backends.

## Settings & secrets model

New fields on `AppSettings`:

```ts
aiProvider: 'anthropic' | 'openai-compatible'
openaiCompatibleBaseUrl: string
openaiCompatibleModel: string
```

`SecretKeyName` becomes `'anthropicApiKey' | 'openaiCompatibleApiKey'`.

`getSettings()`/`defaultSettings()` in `settingsStore.ts` gain the three new fields (default `aiProvider: 'anthropic'`, empty strings for the other two) — same field-by-field merge pattern already used for every other setting.

## New provider implementation

New `src/main/ai/OpenAiCompatibleProvider.ts`. New dependency: the official `openai` npm package, configured with a custom `baseURL` — a first-class documented use case for that SDK (the same mechanism used to point it at Azure OpenAI or any compatible endpoint), giving typed request/response handling without hand-rolling HTTP.

Structurally mirrors `ClaudeProvider.extractComponents()`'s draft-pass logic, reusing everything already provider-agnostic:
- `renderPdfPagesToImages(pdfBytes)` for page images (unchanged — `pdfRenderer.ts`'s current shape takes raw bytes and handles load/destroy internally in one call).
- `buildExtractionSystemPrompt(...)` for the system prompt (unchanged, provider-agnostic text).
- `buildExtractionJsonSchema(...)` for the structured-output schema (unchanged — JSON Schema itself isn't Anthropic-specific).
- `normalizeExtractionPayload(...)` for parsing the response (unchanged).

What differs is the request/response shape against OpenAI's Chat Completions API:
- Images as `image_url: { url: "data:image/png;base64,..." }` content parts (same PNGs, different wrapper than Anthropic's `image`/`source` block).
- Structured output via `response_format: { type: 'json_schema', json_schema: { name: 'sld_extraction', schema: buildExtractionJsonSchema(...), strict: true } }`.
- Non-streaming: `this.client.chat.completions.create({...})` awaited directly, no stream consumption.
- Usage mapped from `completion.usage.prompt_tokens`/`completion.usage.completion_tokens` into the same `{ inputTokens, outputTokens }` shape `ExtractionResult` already expects.

**Explicit, real technical uncertainty — not asserted as solved:** OpenAI's `strict: true` structured-output mode has constraints beyond generic JSON Schema, particularly around nullable/union fields — `boundingBox`'s `anyOf: [{...}, {type: 'null'}]` pattern is exactly that kind of construct, and whether it's accepted under `strict: true` isn't confirmed until tested against a real endpoint. If a real request rejects the strict schema, that's a live-verification finding to act on then (e.g. falling back to `strict: false`, which still requests JSON but doesn't hard-validate the shape) — not something this spec pretends to have already solved.

New `testOpenAiCompatibleApiKey(apiKey: string, baseUrl: string): Promise<TestApiKeyResult>`, mirroring `testAnthropicApiKey`'s cheap zero-generation test — calls `client.models.list()` (most OpenAI-compatible servers support this endpoint even though this app doesn't curate or display the results, unlike the Anthropic path's cached model list).

## Wiring fixes (required for this to function, not incidental cleanup)

Three places currently hardcode "there is only one provider" as an assumption baked into the code, not just a config default — all three have to become real branches for this feature to work at all:

1. **`ai.ipc.ts`'s `getProvider()` factory** currently always constructs `ClaudeProvider`. Branches on `settings.aiProvider`: the Anthropic branch is unchanged; the new branch constructs `OpenAiCompatibleProvider` with `getSecret('openaiCompatibleApiKey')` + `settings.openaiCompatibleBaseUrl` + `settings.openaiCompatibleModel`. The provider-instance cache key needs the provider type folded in, so switching providers doesn't reuse a stale cached instance built for the other one.
2. **`secrets.ipc.ts`'s `secretsTestApiKey` handler** currently ignores its own `keyName` parameter and unconditionally calls `testAnthropicApiKey` — a pre-existing latent bug this feature exposes rather than something newly introduced. Becomes a real branch on `keyName`: the Anthropic key still calls `testAnthropicApiKey`; the new key calls `testOpenAiCompatibleApiKey(key, settings.openaiCompatibleBaseUrl)` (base URL read via `getSettings()` inside the handler, same pattern the BOM-add feature used earlier this session to resolve `defaultMargin` inside its own handler).
3. **`errorCodes.ts`** — `AI_NO_API_KEY`, `AI_UNREACHABLE`, `AI_INVALID_API_KEY`, `AI_KEY_TEST_FAILED` all hardcode the word "Anthropic" in their message text today. These become provider-neutral (`'AI API key not set'`, `'AI provider unreachable'`, `'AI API key rejected'`, `'AI key test failed'`) since they're genuinely shared across both providers now — a user on the OpenAI-compatible path hitting a connection failure must not see "Anthropic unreachable" for a failure that has nothing to do with Anthropic.

## Settings UI

`AiModelSection` gains a **Provider** dropdown at the top (Anthropic / OpenAI-compatible). Selecting Anthropic shows the existing curated model dropdown, unchanged. Selecting OpenAI-compatible replaces it with a base-URL text field and a free-text model-name field. Confidence threshold and max-retries stay visible either way — they're provider-agnostic settings, not tied to which backend runs extraction.

`ApiKeysSection` drops its hardcoded single `ApiKeyField` for `'anthropicApiKey'` and instead renders the field for whichever provider is currently selected (`settings.aiProvider`) — `ApiKeyField` itself needs zero changes, it was already generic over `keyName`/`label`/`description`/`placeholder`. Same for the renderer query hooks (`useApiKeyMasked`, `useSetApiKey`, `useTestApiKey`, `useDeleteApiKey` in `useSecrets.ts`) — all already generic over `keyName`, no changes needed.

## Error handling

`extractComponents()`'s error classification mirrors `ClaudeProvider`'s: catch auth failures (401-equivalent), rate limits, and connection failures separately where the `openai` SDK exposes distinct error types for them (it does, analogous to `@anthropic-ai/sdk`'s `AuthenticationError`/`RateLimitError`/`APIConnectionError`), mapping to the same `AppError` codes (`AI_INVALID_API_KEY`, `AI_RATE_LIMITED`, `AI_UNREACHABLE`) so the rest of the app (error toasts, retry logic in `ai.ipc.ts`) doesn't need to know which provider is active. Anything else falls through to `AI_REQUEST_FAILED`, logged via `console.error`, matching `ClaudeProvider`'s existing non-classified-error handling.

## Testing

No renderer tests — matches this codebase's existing convention. `OpenAiCompatibleProvider.extractComponents()` and `testOpenAiCompatibleApiKey` aren't unit-tested either — they're live API calls against an arbitrary user-configured endpoint, same reasoning `ClaudeProvider.ts` has never been unit-tested (this project has zero `vi.mock()` usage anywhere; IPC/SDK-wrapping files are live-verified, not mocked).

**Live verification (required, cannot be substituted):** the user needs a real OpenAI-compatible endpoint + API key to test against (their own OpenAI key, or another compatible provider). Confirm: Test Connection succeeds against a real endpoint; a real extraction run against a real SLD produces a sensible result (even if quality is lower than Claude's — that's expected and not a bug); switching the provider dropdown between Anthropic and OpenAI-compatible and back works correctly (no stale cached provider instance, no stale error messages); a bad API key or unreachable base URL produces a provider-neutral error message, not one saying "Anthropic".

## Out of scope

- Gemini or any other non-OpenAI-compatible provider — deferred to a later pass once this one is proven.
- The self-verification (2nd) pass for the new provider.
- Streaming for the new provider.
- Per-project provider override (only per-project *model* override exists today, for Claude; extending that axis to provider selection is a separate, larger decision not made here).
- Dynamic model-list fetching/caching for the new provider — model name stays free text.
