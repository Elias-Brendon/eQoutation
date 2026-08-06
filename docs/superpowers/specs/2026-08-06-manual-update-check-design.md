# Manual "Check for Updates" in Settings — Design

**Date:** 2026-08-06
**Status:** Approved
**Context:** Extends the auto-update feature from `docs/superpowers/specs/2026-08-03-auto-update-design.md` (once-per-launch Gist version check, dismissible TopBar pill). That feature is complete and live-verified, but Settings has no way to trigger a check manually — `AboutSection.tsx` only shows the static current version. This spec adds a manual check, wired into the same Gist/cache/TopBar mechanism rather than building a second notification path.

## Scope decision

The existing design (Gist-based, notify-only, no silent download, no `electron-updater`, no embedded credentials — see the 2026-08-03 spec's "Scope decision" for why) is unchanged. This is additive: one more way to trigger the same check, plus surfacing its result in one more place.

The TopBar pill stays exactly as it is today (confirmed with the user — no toast/popup added). A manual check's result feeds the *same* cached status the pill already reads, so a user who clicks "Check for Updates" in Settings and finds a new version will also see the TopBar pill update immediately, with no separate code path to keep in sync.

## Components

### 1. Main process — `updateCheck.ts`

`checkForUpdate(currentVersion: string): Promise<void>` becomes `Promise<boolean>` — `true` when the fetch succeeded and `cachedStatus` was refreshed, `false` on any failure (network error, non-200, malformed JSON — same failure set as today, just no longer swallowed past the function boundary). The existing launch-time call site (`main/index.ts`, inside `app.whenReady()`) keeps its current fire-and-forget treatment; it does not read the new return value, so its behavior is unchanged — a failed launch-time check still fails silently, exactly as designed in the original spec.

### 2. IPC — new channel `app:checkForUpdate`

Added to `ipc-contract.ts` alongside the existing `appGetVersion`/`appGetUpdateStatus`. Handler in `app.ipc.ts`:

```typescript
safeHandle(IPC.appCheckForUpdate, async (): Promise<{ status: UpdateStatus | null; succeeded: boolean }> => {
  const succeeded = await checkForUpdate(app.getVersion())
  return { status: getUpdateStatus(), succeeded }
})
```

Unlike the launch-time check, this path is a direct response to a user action — so its failure is meaningful to surface, not something to swallow.

### 3. Renderer — `useCheckForUpdate()` mutation

New hook in `useApp.ts`, alongside the existing `useAppVersion`/`useUpdateCheck` queries:

```typescript
export function useCheckForUpdate(): UseMutationResult<{ status: UpdateStatus | null; succeeded: boolean }> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.app.checkForUpdate(),
    onSuccess: (result) => {
      queryClient.setQueryData(['app', 'updateStatus'], result.status)
    }
  })
}
```

Writing the result into the `['app', 'updateStatus']` query key — the same key `useUpdateCheck()` (used by both `AboutSection` and the TopBar's `UpdateNotice`) already reads — is what makes the TopBar pill update immediately after a manual check, with no new state to reconcile.

### 4. UI — `AboutSection.tsx`

Adds, below the existing version line:
- A "Check for Updates" button (spinner via `mutation.isPending`).
- A status line, in priority order:
  1. `mutation.isPending` → "Checking for updates…"
  2. `mutation.data?.succeeded === false` (a manual check just failed) → "Couldn't check for updates — check your connection and try again."
  3. `status?.isNewer` (from `useUpdateCheck()`, reflecting either the launch-time check or the latest manual one) → "Update available: vX.Y.Z" with a link to the Releases page (same hardcoded URL the TopBar pill already uses).
  4. `status` present and not newer → "You're up to date (vX.Y.Z)."
  5. Otherwise (no successful check yet — e.g. launch-time check failed silently and the user hasn't clicked the button) → "Not checked yet."

State 2 only appears after an explicit manual failure (`mutation.data` is unset until the user clicks) — a silently-failed launch-time check never shows an error, matching the original design's "never block or alarm the user over a best-effort check" intent.

### 5. Tests

- `updateCheck.test.ts`: extend for the `Promise<boolean>` return (already-passing `isNewerVersion` cases untouched).
- IPC handler test matching the existing `appGetVersion`/`appGetUpdateStatus` coverage pattern.
- Hook/component coverage matching existing `AboutSection`/`useAppVersion` test patterns, if any exist for that section (verify during planning — `AboutSection.tsx` may currently be untested, matching how simple display-only settings sections are handled elsewhere in this codebase).

## Documentation (new deliverable for this pass)

Two things, requested explicitly for future debugging — both additive to what already exists:

1. **Code comments**: the non-obvious *why*s get comments at the point they matter — e.g. why the launch-time check swallows failures but the manual one doesn't, why the mutation writes through `setQueryData` instead of an `invalidateQueries` refetch (avoids a redundant second network call right after the mutation's own fetch already completed), why the Gist URL/Releases URL are hardcoded rather than configurable. No restating of what the code obviously does.
2. **`DEVELOPMENT.md`'s existing "Release workflow" section (line ~163) gets expanded** into a fuller runbook, since that file is already this project's established "for future debugging" reference (per its own stated purpose). Expansion covers:
   - The end-to-end push process (unchanged steps 1-4, `npm run release` → tag → push → build → verify), with step 5 (updating the Gist) clarified as the step that actually makes the app-side notice appear.
   - How the app checks for updates end-to-end: launch-time silent check → cached in main-process memory → IPC → TopBar pill + Settings display; plus the new manual path (Settings button → fresh IPC fetch → same cache → both UI surfaces update).
   - Debugging tips: how to verify the Gist is reachable and well-formed (`curl`/browser the raw URL), how to force an "update available" state locally for testing (temporarily point `LATEST_VERSION_GIST_URL` at a Gist with a higher version, or lower `app.getVersion()`'s comparison target), and the failure modes that produce each Settings status line (offline, Gist edited to invalid JSON, Gist URL typo'd after a repo/account change).

No new standalone README file — folding this into `DEVELOPMENT.md` avoids a second, easily-stale doc covering the same release process from a different angle.

## Out of scope

Unchanged from the 2026-08-03 spec: no silent background download/install, no code-signing infrastructure, no embedded credentials, no toast/popup notification, no in-app changelog display, no check-rate-limiting/periodic-background-polling beyond "once per launch plus on-demand manual".
