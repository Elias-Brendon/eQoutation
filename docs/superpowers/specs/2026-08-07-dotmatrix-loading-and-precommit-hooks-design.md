# Dot-Matrix Extraction Indicator + Pre-Commit Hooks — Design

**Date:** 2026-08-07
**Status:** Approved
**Context:** `ExtractionPanel.tsx` (`src/renderer/src/components/pdf/ExtractionPanel.tsx:100-110`) shows AI-extraction progress as a linear bar whose fill width tracks `liveProgress.pct` (from `useUiStore().extractionProgress`, pushed via `ai:extractionProgress` IPC from `ClaudeProvider.ts`/`OpenAiCompatibleProvider.ts`), plus a `stage` text label (e.g. "Analyzing diagram"). The user sourced a `DotmSquare2` dot-matrix loading animation from 21st.dev and wants it to replace the bar. Separately, a prior standards audit flagged several process gaps (no CI/CD, no pre-commit hooks, `sandbox:false`, no dependency scanning, unsigned installer); the user chose to fold in the pre-commit-hooks gap as an extra stage of this same plan rather than opening a separate initiative — the rest stay unaddressed for now.

## Scope decision

Two independent, small changes bundled into one plan because they were decided together in the same brainstorming session — not because they share code. Each ships as its own stage/commit.

## Part 1 — DotmSquare2 integration

### Source files (fetched via the `21st` MCP server, `get id 19185` / raw registry JSON)

`DotmSquare2` is a continuous, time-driven loop animation (`requestAnimationFrame`-based route stepping through a 5x5 grid) — it has no fill/percentage state, unlike the bar it replaces. Confirmed via `dotmatrix-hooks.ts`: `useDotMatrixPhases`/`useSteppedCycle` just cycle on a wall-clock interval scaled by `speed`, driven by a boolean `animated` prop, not by any progress value. Default `color` prop is `currentColor` (`dotmatrix-core.tsx:696`), so it inherits from a wrapping element's text color rather than needing an explicit color prop.

### 1. Vendor the four registry files as-is

Port into `src/renderer/src/components/ui/`:
- `dotm-square-2.tsx`
- `dotm-square-2-utils/dotmatrix-core.tsx`
- `dotm-square-2-utils/dotmatrix-hooks.ts`
- `dotm-square-2-utils/dotmatrix-loader.css`

Treated as vendored third-party code: only mechanical changes, no logic edits.
- Rewrite `@/components/ui/...` and `@/components/...` import paths to `@renderer/components/ui/...` (this project's alias, confirmed in `project-dotmatrix-loading-bar-integration` memory — no `components.json`, no shadcn CLI scaffold, existing convention is `@renderer/*`).
- Fix one upstream inconsistency: `dotmatrix-core.tsx` imports its CSS via `@/components/dotmatrix-loader.css`, but the registry actually places the file at `dotm-square-2-utils/dotmatrix-loader.css` — point the import at the correct co-located path.
- Do not trim the unused `MatrixPattern`/`DotMatrixColorPreset` variants (diamond, rose, cross, rings, gradient presets, hover-ripple phases, etc.). It's inert code we didn't author; touching it for a marginal bundle-size win in a 46KB file risks introducing a bug we can't easily spot. Only `pattern="full"` and the default `currentColor` path get exercised.
- No new npm dependencies — the ported files use only React (`useEffect`/`useMemo`/`useRef`/`useState`, `requestAnimationFrame`). No `cn()`/`clsx` dependency in the vendored code despite this project having one available.

### 2. Wire into `ExtractionPanel.tsx`

Replace the bar block at lines 100-110:

```tsx
{running && (
  <div className="flex items-center gap-2">
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
      <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
    </div>
    <span className="w-32 shrink-0 font-mono text-[11px] text-text-muted">{stage}</span>
  </div>
)}
```

with:

```tsx
{running && (
  <div className="flex items-center gap-2">
    <DotmSquare2 animated size={20} dotSize={3} className="text-accent" />
    <span className="font-mono text-[11px] text-text-muted">{stage}</span>
  </div>
)}
```

`className="text-accent"` sets `currentColor` to `--color-accent` (`#f2652c`), matching the existing bar's `bg-accent` fill exactly.

### 3. Drop `pct` from the rendered UI

Per explicit decision: the numeric percentage is not shown in any form (no bar fill, no "42%" appended to the stage text). `liveProgress.pct` stays wired through the store and IPC layer unchanged — only its use in this one render is removed. `pct` becomes unused in `ExtractionPanel.tsx` and should be deleted from the component along with the now-dead width-calculation line.

## Part 2 — Pre-commit hooks

### 1. Add `husky` + `lint-staged` as dev dependencies

Local-only, no CI infrastructure — matches the audit gap actually selected (the other flagged gaps — CI/CD, `sandbox:false`, dependency scanning, unsigned installer — are explicitly out of scope for this plan).

### 2. `lint-staged` config in `package.json`

Runs only on staged files, so it stays fast on every commit:
- `*.{ts,tsx}` → `eslint --cache --fix`
- `*.{ts,tsx,json,css,md}` → `prettier --write`

### 3. Typecheck excluded from the hook

`npm run typecheck` (`tsc --noEmit -p tsconfig.node.json` + `tsconfig.web.json`) is whole-project, not file-scoped — running it on every commit would be slow and duplicate what's already run manually/pre-push. Lint + format on staged files is the right scope for a commit-time gate.

### 4. `husky init` + `prepare` script

`.husky/pre-commit` runs `npx lint-staged`. A `prepare` script is added to `package.json` so hooks install automatically on `npm install` for any future clone/checkout — no manual setup step to forget.

## Out of scope

- No CI/CD pipeline, no `sandbox:false` fix, no dependency scanning, no installer signing — all deferred per the user's explicit choice to fold in only the pre-commit-hooks gap this round.
- No refactor of the vendored `dotm-square-2-utils` files beyond import-path fixes — they are treated as opaque third-party code.
- No change to how `liveProgress.pct` is computed, stored, or transmitted over IPC — only its rendering in `ExtractionPanel.tsx` changes.
