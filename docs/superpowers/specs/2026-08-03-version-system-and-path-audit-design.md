# Version System + No-Hardcoded-Paths Audit — Design

**Date:** 2026-08-03
**Status:** Approved
**Context:** Beta-packaging initiative, sub-project 2 of 5 (see `project_remaining_stages_roadmap` memory). Sub-project 1 (legal & branding metadata) is done and merged — it added a minimal `app:getVersion` IPC that reads `package.json`'s version live, but explicitly deferred building an actual versioning process to this sub-project.

## 1. No-hardcoded-paths audit

**Finding: the codebase is already clean. No code changes required.**

Every path-construction site in `src/main` that could differ between dev and a packaged install was audited:

- `src/main/settings/settingsStore.ts` — `defaultCatalogDir()` branches on `app.isPackaged`: packaged builds use `app.getPath('userData')/catalog`, dev uses `process.cwd()/catalog`. Already has an inline comment explaining why the dev-only fallback is safe.
- `src/main/db/index.ts` — sqlite path is `app.getPath('userData')/eqoutation.sqlite`, overridable only via `EQOUTATION_DB_PATH` (test-only, never set in packaged builds).
- `src/main/settings/secretsStore.ts`, `src/main/storage/sldStorage.ts`, `src/main/export/projectExporter.ts`, `src/main/quotation/quotationExcelBuilder.ts`, `src/main/export/trainingDataExporter.ts`, `src/main/auth/sessionTokenStore.ts` — all use `app.getPath(...)`, no literal paths.
- `src/main/index.ts` — the only `__dirname` usages are the standard electron-vite preload/renderer resolution pattern, which is correct in both dev and packaged builds.

No literal `C:\Users\...` or other machine-specific paths exist anywhere in `src/`.

**Deliverable:** this document records the audit; no implementation tasks follow from it.

## 2. Versioning pipeline

**Goal:** a repeatable, low-ceremony way to bump the app's version and keep a changelog, run locally before each beta build (no CI exists yet).

**Tool:** `standard-version` (devDependency). Chosen over `changesets` (built for concurrent-PR teams, unnecessary ceremony for a solo local workflow) and a hand-rolled script (loses changelog generation from commit messages, which the repo's existing `feat:`/`fix:`/`chore:` convention already supports for free).

**Versioning scheme:** plain semver, no prerelease suffix (e.g. `0.2.0`, not `0.2.0-beta.1`). The leading `0.x` already communicates pre-1.0/beta status by convention.

**Setup:**
- Add `standard-version` as a devDependency.
- Add npm script: `"release": "standard-version"`.
- Default `bumpFiles` behavior is used as-is (bumps `package.json` and `package-lock.json`, both present in this repo).
- No `.versionrc` overrides needed — defaults match the desired plain-semver, standard `CHANGELOG.md` behavior.

**Bootstrap (one-time, done as part of this sub-project's implementation):**
Run `npx standard-version --first-release`. This does **not** bump the version (stays at the current `0.1.0`) and does **not** mine the 111 pre-existing commits into the changelog — it just creates `CHANGELOG.md` with a version header and tags `v0.1.0`. This is a deliberate choice: the repo's first ~20 commits (`Stage 0` … `Stage 8`) predate the `feat:`/`fix:`/`chore:` convention, so mining full history would produce a messy first entry. Full commit history remains available via `git log`; the changelog starts clean from this point forward.

**Packaging:** `electron-builder.yml`'s `files` exclusion list already excludes `CHANGELOG.md` from the packaged app (added in sub-project 1) — no change needed here.

**Ongoing workflow (documented, not tool-enforced):**
1. Merge feature/fix work to `master` using conventional commit messages (already the established convention in this repo).
2. Before building a beta installer, run `npm run release`. This bumps `package.json`'s version according to the highest-impact commit type since the last tag, prepends a new `CHANGELOG.md` entry summarizing the conventional commits since the last tag, and creates a `chore(release): X.Y.Z` commit + `vX.Y.Z` git tag.
3. `git push --follow-tags`.
4. Build the installer as usual (`npm run build:win` etc.) — the version baked into the installer/app now matches the tag.

**No changes needed to existing version display:** the About panel (sub-project 1) reads the version live via `window.api.app.getVersion()` → `app.getVersion()` (Electron, reads `package.json`), so it automatically reflects whatever `standard-version` bumps it to. No IPC, hook, or UI changes are needed in this sub-project.

## Out of scope

- CI/automated releases (no CI pipeline exists yet; this stays a local, manual step).
- Prerelease version identifiers (`-beta.N`) — rejected per the plain-semver decision above.
- A regression guard/lint test for hardcoded paths — rejected since the audit found no actual violations to guard against; revisit if a real violation is ever found.
- Auto-update wiring — that's sub-project 5 on the roadmap, unrelated to version *numbering*.
