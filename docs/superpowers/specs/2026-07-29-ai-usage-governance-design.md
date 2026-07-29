# AI Usage Governance — Design

## Context

Two related gaps exist in AI extraction today (`src/main/ipc/ai.ipc.ts`, `src/main/ai/ClaudeProvider.ts`):

1. Nothing captures token usage. The Anthropic SDK response includes `message.usage` (input/output token counts) but it's discarded — there's no visibility into how much of the API budget any single extraction, or a whole project, has consumed.
2. Nothing stops a user from re-running extraction on the same SLD repeatedly. Each re-run is a full API call against the same PDF.

This is item 1 of the 4-subsystem roadmap agreed 2026-07-29 (project handling save/reload, AI usage governance, project revisions, training-data collection), and lines up with the standing "AI cost/spend governance" gap already tracked in `project_remaining_stages_roadmap`.

## Goals

- Show token usage (input + output) per extraction, and a running total per project.
- Limit an SLD to one successful extraction; require an explicit, confirmed action to re-extract.
- Keep the retry logic already in `ai.ipc.ts` (`maxExtractionRetries`) working exactly as today — the lock is about user-initiated re-runs after a *successful* extraction, not about the internal retry loop on a single request.

## Non-goals

- No dollar-cost conversion. Token counts only — the user does not want a maintained $/token pricing table for this step.
- No project-switcher UI changes (that's subsystem 2, project state save/reload).
- No changes to what happens while an SLD has never been successfully extracted, or whose last extraction errored — those keep working exactly as today (unlimited retries, no confirmation).

## Design

### Data model (migration `0019_extraction_token_usage.ts`)

```sql
ALTER TABLE extractions ADD COLUMN input_tokens INTEGER;
ALTER TABLE extractions ADD COLUMN output_tokens INTEGER;
```

Nullable — populated whenever an extraction reaches a terminal state (`done` or `error`). Failed attempts still spend real tokens (e.g. `AI_EXTRACTION_TRUNCATED` means the model generated a full `max_tokens` of output before failing to parse), so they're counted too; only a request that fails before any API response (e.g. `AI_NO_API_KEY`, `AI_UNREACHABLE`) leaves both columns `null`.

### Extraction flow changes

- `AIProvider.extractComponents` (`AIProvider.ts` interface, `ClaudeProvider.ts` implementation) returns `usage: { inputTokens: number; outputTokens: number }` alongside the existing `{ model, components, flags }`, read from `message.usage.input_tokens` / `message.usage.output_tokens` on the final assembled message.
- `ai.ipc.ts`'s retry loop already calls `provider.extractComponents` up to `maxExtractionRetries + 1` times per `aiExtractSld` call. Each attempt's usage is accumulated into running totals (`totalInputTokens += ...`) across the loop, since from the user's perspective one `aiExtractSld` call is "one extraction" regardless of how many attempts it took internally.
- `completeExtraction(id, model, payload, usage)` and `failExtraction(id, error, usage)` in `extractionsRepo.ts` gain a `usage: { inputTokens, outputTokens } | null` parameter and persist it. `usage` is `null` when no API response was ever received.
- **Rerun lock**: before `createRunningExtraction`, `aiExtractSld` calls the existing `getLatestExtractionForSld(sldId)`. If that extraction exists and `status === 'done'`, and the call was not made with `force: true`, throw a new `AI_ALREADY_EXTRACTED` error code (added to `src/shared/errors/errorCodes.ts`) instead of spending any tokens. The IPC signature becomes `aiExtractSld(sldId: string, options?: { force?: boolean })`.

### Project total

New `getProjectTokenUsage(projectId): { totalInputTokens: number; totalOutputTokens: number; extractionCount: number }` in `extractionsRepo.ts` — joins `extractions` → `slds` filtered by `slds.project_id = ? AND slds.deleted_at IS NULL`, summing over every terminal (`done` or `error`) extraction. Exposed as `IPC.aiGetProjectTokenUsage`.

### UI

- **`ExtractionPanel.tsx`**: on a `done` extraction, show token counts (e.g. `12.3K in / 3.2K out`) next to the existing component-count badge.
- Once `status === 'done'`, the action button changes from "Re-run" to "Re-extract…". Clicking it shows a `window.confirm(...)` warning that re-running calls the AI again (following the same native-confirm pattern already used in `PdfViewer.tsx` for delete confirmations) — confirming calls `extractSld.mutate({ sldId, force: true })`. A `running` or `error` extraction keeps today's one-click, no-confirmation behavior.
- **`TopBar.tsx`**: a small badge next to the currency field showing the project's total tokens (e.g. `142.7K tokens`), tooltip broken down into input/output. Uses the same visual pattern as the existing `FlagBadge`.

### Types

- `Extraction` (`shared/types/entities.ts`) gains `inputTokens: number | null` and `outputTokens: number | null`.
- `ExtractParams`/`ExtractionResult` in `AIProvider.ts` gain the `usage` field described above.

## Error handling

- `AI_ALREADY_EXTRACTED` (new `errorCodes.ts` entry) — thrown when `aiExtractSld` is called without `force: true` on an SLD whose latest extraction is `done`. Rendered the same way other `AppError`s already are in `ExtractionPanel.tsx`.
- Token usage fields are best-effort: if `message.usage` is ever missing/malformed from the SDK, store `null` rather than throwing — token visibility is a nice-to-have, never a reason to fail an otherwise-successful extraction.

## Testing

- Unit: `getProjectTokenUsage` sums correctly across multiple SLDs/extractions in a project, excludes soft-deleted SLDs, excludes other projects' extractions.
- Unit/integration: a second `aiExtractSld` call without `force` on an SLD with a `done` extraction throws `AI_ALREADY_EXTRACTED` and makes no API call; the same call with `force: true` proceeds normally.
- Existing retry-loop tests (if any) still pass unchanged — accumulation of usage across attempts doesn't change control flow, only what's persisted.

## Verification

- `npm run test:all` passing, including the new cases above.
- Manual: run a real extraction on a throwaway SLD, confirm token counts appear in `ExtractionPanel` and the project badge updates in `TopBar`; attempt a second extraction on the same SLD and confirm the confirmation prompt appears and blocks the API call until confirmed.
