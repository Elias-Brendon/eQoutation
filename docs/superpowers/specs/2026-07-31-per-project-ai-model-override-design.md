# Per-Project AI Model Override — Design Spec

**Date:** 2026-07-31
**Status:** Approved
**Roadmap context:** Item 4 of the agreed remaining-stages roadmap (see memory `project_remaining_stages_roadmap`), originally Stage 14 "per-project model override" in the base plan.

## Problem

The AI model used for BOM extraction (`Settings.aiModel`) is a single global setting (`src/renderer/src/components/settings/sections/AiModelSection.tsx`, backed by `src/main/settings/settingsStore.ts`) applied to every extraction across every project. There is no way to use a cheaper/faster model (e.g. Haiku) for a low-stakes test project while keeping a slower/more-accurate one (e.g. Opus) for a real client project, without changing the global setting back and forth.

## Scope

Add an optional per-project override that, when set, takes precedence over the global default for that project's extractions only. When unset (`null`), behavior is unchanged from today. No per-SLD granularity — the roadmap item and this spec are project-level only, matching the existing per-project `currency` field's granularity.

## Architecture

Mirrors the existing per-project `currency` override end-to-end (migration → repo → IPC → preload → renderer hook → UI) — that's the only precedent for a per-project setting in this codebase, and it already works well.

- **DB**: new migration `0023_project_ai_model_override.ts`: `ALTER TABLE projects ADD COLUMN ai_model_override TEXT NULL;` (next migration number after `0022_annotation_quotation_line.ts`). `NULL` means "use the global default."
- **Shared types** (`src/shared/types/entities.ts`): `Project.aiModelOverride: string | null`. New `UpdateProjectAiModelOverrideInput { projectId: string; aiModelOverride: string | null }`.
- **Repo** (`src/main/db/repositories/projectsRepo.ts`): `ProjectRow`/`toProject` gain the field; `createProject`'s insert sets it to `null`; new `updateProjectAiModelOverride(id, aiModelOverride: string | null): Project`, mirroring `updateProjectCurrencySettings`'s shape (single `UPDATE ... WHERE id = ?`, returns the refetched row via `getProjectById`).
- **IPC** (`src/shared/types/ipc-contract.ts`, `src/main/ipc/projects.ipc.ts`, `src/preload/index.ts`): new `projects:updateAiModelOverride` endpoint, `safeHandle`-registered, mirroring `projects:updateCurrencySettings` exactly (same three-file touch pattern).
- **Renderer query hook** (`src/renderer/src/state/queries/useProjects.ts`): `useUpdateProjectAiModelOverride()`, mirroring `useUpdateProjectCurrencySettings()` — mutate + invalidate `projectsQueryKey`.

## Extraction path change

`src/main/ipc/ai.ipc.ts`'s `getProvider()` currently reads `getSettings().aiModel` directly and caches the `ClaudeProvider` instance keyed on `${apiKey}:${aiModel}`. It changes to accept the *effective* model as a parameter instead of reading global settings itself:

```ts
function getProvider(effectiveModel: string): AIProvider {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) throw new AppError('AI_NO_API_KEY')
  const cacheKey = `${apiKey}:${effectiveModel}`
  if (!provider || providerCacheKey !== cacheKey) {
    provider = new ClaudeProvider(apiKey, effectiveModel)
    providerCacheKey = cacheKey
  }
  return provider
}
```

Inside the `aiExtractSld` handler, after fetching `sld` (which already happens, `sld.projectId` is available), fetch the project via the existing `getProjectById(sld.projectId)` and compute `const effectiveModel = project?.aiModelOverride ?? getSettings().aiModel` before calling `getProvider(effectiveModel)`. Everything downstream (retry loop, progress events, `completeExtraction` storing `result.model`) is unchanged — extraction records already capture which model actually ran, per-extraction, regardless of whether it came from the override or the global default.

## UI

Lives in `ExtractionPanel` (`src/renderer/src/components/pdf/ExtractionPanel.tsx`) — the per-SLD panel where extraction is actually triggered ("Generate"/"Re-extract…"). Although the setting is project-wide, this is where the user's attention already is when the model choice matters, so it's the most useful spot even though it needs a label making clear it isn't per-SLD.

`ExtractionPanel` needs the current `Project` (currently it only receives `sldId`). `CenterPanel` (`src/renderer/src/components/layout/CenterPanel.tsx`) gets a new `project: Project | null` prop, threaded from `App.tsx`'s existing `selectedProject` (already computed there, no new query — `sld.projectId === selectedProject.id` always holds when an `sld` is rendered, since `useSlds(selectedProjectId)` only returns SLDs for the active project).

A small labeled row, e.g.:

```
Project AI model (applies to every SLD in this project)
[ Use global default (currently: Claude Sonnet 5) ▾ ]
```

The `<select>` options: first is `""` (sentinel, maps to `null`) labeled `Use global default (currently: <label of settings.aiModel from AVAILABLE_AI_MODELS>)`, followed by each entry from the existing `AVAILABLE_AI_MODELS` (`src/shared/constants/aiModels.ts`) — the same curated three-model list Settings already uses, so no new model catalog is introduced. Selecting an explicit model calls `useUpdateProjectAiModelOverride().mutate({ projectId, aiModelOverride: modelId })`; selecting the first option calls it with `aiModelOverride: null`.

## Error handling

None beyond what the existing mutation pattern already provides — same as currency, a failed mutation surfaces via React Query's error state with no special handling needed (this is a low-stakes preference toggle, not a validated business operation).

## Testing

- New `src/main/db/repositories/projectsRepo.dbtest.ts` (no existing test file for this repo — first one), covering: `createProject` defaults `aiModelOverride` to `null`; `updateProjectAiModelOverride` sets and clears (back to `null`) the override; `listProjects`/`getProjectById` round-trip the field correctly. Follows the existing `*.dbtest.ts` convention (e.g. `catalogRepo.dbtest.ts`) run via `npm run test:db`.
- Manual/live verification (no renderer test infra exists — see memory `project_remaining_stages_roadmap`'s note on the project-switcher item, same constraint applies here): set an override on the throwaway test project, confirm the dropdown reflects it after reload, run a real extraction and confirm (via the extraction's stored `model` field, visible today in dev tooling/DB inspection) that the overridden model was actually used, then clear the override and confirm a subsequent extraction falls back to the global default.
