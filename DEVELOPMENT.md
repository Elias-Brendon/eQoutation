# eQuotation — Developer Guide

A deep-dive companion to `README.md` (which only covers install/dev/build). This file is for anyone modifying, debugging, or extending the app: what it does, how it's built, where things live, and how to fix things when they break.

## What this app is

eQuotation is a desktop tool for switchboard/panel manufacturing quotations. The workflow: upload a Single Line Diagram (SLD) PDF → Claude extracts a Bill of Materials (components, quantities, panel groupings) from it → the extraction gets matched against a local component catalog → a human reviews/corrects flagged or low-confidence lines → an Excel quotation workbook is exported. It's B2B software for one manufacturer's internal quoting process, currently in closed beta with a handful of known testers.

## Tech stack

| Layer | Technology | Docs |
|---|---|---|
| Shell | [Electron](https://www.electronjs.org/) 39, scaffolded/bundled via [electron-vite](https://electron-vite.org/) | [electronjs.org/docs](https://www.electronjs.org/docs/latest/) |
| UI | [React](https://react.dev/) 19 + TypeScript 5, [Tailwind CSS](https://tailwindcss.com/) 4 | [react.dev](https://react.dev/), [tailwindcss.com/docs](https://tailwindcss.com/docs) |
| State/data fetching | [TanStack Query](https://tanstack.com/query/latest) (all renderer↔main IPC calls go through it as queries/mutations) | [tanstack.com/query](https://tanstack.com/query/latest) |
| Animation | [Framer Motion](https://motion.dev/) | [motion.dev/docs](https://motion.dev/docs) |
| Database | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (synchronous, embedded, WAL mode) | [github.com/WiseLibs/better-sqlite3/wiki](https://github.com/WiseLibs/better-sqlite3/wiki) |
| AI extraction | [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) (Claude models) | [docs.anthropic.com](https://docs.anthropic.com/) |
| PDF rendering | [pdfjs-dist](https://mozilla.github.io/pdf.js/) — **pinned to 4.10.38**, do not upgrade (see Gotchas) | [mozilla.github.io/pdf.js](https://mozilla.github.io/pdf.js/) |
| PDF manipulation | [pdf-lib](https://pdf-lib.js.org/) | [pdf-lib.js.org/docs](https://pdf-lib.js.org/docs/api/) |
| Excel export | [exceljs](https://github.com/exceljs/exceljs) | [github.com/exceljs/exceljs](https://github.com/exceljs/exceljs) |
| Archives | [archiver](https://github.com/archiverjs/node-archiver) (project export bundles) | [archiverjs.com](https://www.archiverjs.com/) |
| Currency rates | [Frankfurter API](https://frankfurter.dev/) (free, keyless, ECB reference rates) | [frankfurter.dev/docs](https://frankfurter.dev/docs) |
| Packaging | [electron-builder](https://www.electron.build/) (NSIS installer on Windows) | [electron.build](https://www.electron.build/) |
| Versioning | [standard-version](https://github.com/absolute-version/commit-and-tag-version) | [github.com/absolute-version/commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) |
| Testing | [Vitest](https://vitest.dev/) (two suites — see Testing below) | [vitest.dev/guide](https://vitest.dev/guide/) |
| Lint/format | [ESLint](https://eslint.org/) 9 (flat config) + [Prettier](https://prettier.io/) | [eslint.org/docs](https://eslint.org/docs/latest/) |

## Project structure

```
src/
  main/                    Electron main process (Node.js, full OS access)
    ai/                    Claude extraction: ClaudeProvider, prompt templates, JSON schema
    auth/                  Local username/password auth, session tokens
    catalog/               Catalog .xlsx loading/writing/matching
    db/
      migrations/          Numbered SQL migrations (0001..0025+), index.ts registers them in order
      repositories/        One file per table — all raw SQL lives here, nowhere else
    errors/                AppError class
    export/                Project bundle / training-data / diagnostic-bundle exporters
    fx/                    Frankfurter client + daily exchange-rate refresh
    ipc/                   One *.ipc.ts file per feature area — registers IPC handlers via safeHandle
    observability/         Crash handlers (main + renderer process)
    quotation/             Quotation generation, catalog matching, Excel builder
    settings/              settingsStore (settings.json), secretsStore (encrypted API keys)
    storage/               SLD PDF file storage on disk
    updateCheck/           Best-effort version-check against a public Gist
    index.ts               App entry point — window creation, IPC registration, startup hooks
  preload/                 contextBridge — the ONLY code the renderer can call into main through
  renderer/src/
    components/            React components, grouped by feature area
    state/queries/         One file per feature area — TanStack Query hooks wrapping window.api.*
    hooks/, lib/            Small renderer-only utilities
  shared/
    types/                 entities.ts (every shared type) + ipc-contract.ts (every IPC channel name)
    errors/                errorCodes.ts — single source of truth for every user-facing error code
    constants/              Static config (AI model fallback list, component types, currencies)
```

Docs/process artifacts (not part of the app itself): `docs/superpowers/specs/` (design docs) and `docs/superpowers/plans/` (implementation plans) — one pair per feature, chronologically named `YYYY-MM-DD-<topic>-{design,plan}.md`. Read these for the reasoning behind any non-obvious decision.

## Architecture: the three-process model

Electron apps have three separate JS contexts that **cannot** call each other's functions directly:

1. **Main** (`src/main/`) — Node.js, owns the database, filesystem, network calls, OS APIs. Nothing in the renderer can `require()` anything from here.
2. **Preload** (`src/preload/index.ts`) — a bridge script with access to Node.js *and* the ability to expose a limited API into the renderer via `contextBridge.exposeInMainWorld('api', {...})`. This is the entire surface area the UI can call.
3. **Renderer** (`src/renderer/`) — the React app, sandboxed, can only call `window.api.*`.

**The IPC pattern, end to end** (this is the shape every new feature follows):

1. Add a channel name to `src/shared/types/ipc-contract.ts`'s `IPC` object.
2. Add a handler in the matching `src/main/ipc/*.ipc.ts` file, wrapped in `safeHandle(channel, handlerFn)` (see `src/main/ipc/safeHandle.ts`) — this catches any unexpected error, logs it to `event_log` (see Observability below), and replaces it with a sanitized `AppError` before it crosses into the renderer, so internal details (stack traces, raw DB errors) never leak into the UI.
3. Expose it in `src/preload/index.ts`'s `api` object: `someName: (args) => ipcRenderer.invoke(IPC.someChannel, args)`.
4. Add a React Query hook in `src/renderer/src/state/queries/*.ts` wrapping `window.api.someName(...)` — a `useQuery` for reads, `useMutation` for writes.
5. Use the hook from a component.

If you're adding a new feature, `git log --oneline -- docs/superpowers/plans/` and pick the most similar recent plan file — every one of them follows this exact 5-step shape with the real code.

## Data layer

`better-sqlite3`, single file at `%APPDATA%\eqoutation\eqoutation.sqlite` (packaged) or the same path relative to `app.getPath('userData')` in dev. Schema changes are **numbered migrations**, never manual `ALTER TABLE` outside that system:

- Add `src/main/db/migrations/00XX_description.ts` exporting a `sql` string.
- Register it in `src/main/db/migrations/index.ts` (import + add to the `migrations` array with the next `version` number).
- Migrations run automatically on `getDb()`'s first call (see `src/main/db/index.ts`) via a `schema_version` tracking table — never re-run, never re-ordered.

Every table has a matching repository file in `src/main/db/repositories/` — raw `db.prepare(...).run/get/all(...)` calls live only there, converting between snake_case DB rows and camelCase TypeScript types (the `to<Thing>()` pattern you'll see at the top of every repo file).

Key tables: `projects`, `slds`, `extractions`, `quotations`, `quotation_lines`, `catalog_items`, `flags`, `quotation_comments`, `feedback_log` (AI-vs-human correction history, the training-data corpus), `annotations` (PDF bounding-box overlays), `event_log` (errors/crashes), `users`/`sessions` (local auth).

## AI extraction pipeline

`src/main/ai/ClaudeProvider.ts` is the only thing that talks to Anthropic for extraction. Given a PDF, it:
1. Builds a JSON schema (`extractionSchema.ts`) describing exactly the shape of components/flags/bounding-boxes Claude must return.
2. Builds a system prompt (`promptTemplates.ts`) combining built-in extraction rules with any user-added custom rules from Settings.
3. Streams a `messages.create()` call (streaming is required at the 64k `max_tokens` budget dense SLDs need, to avoid HTTP timeouts).
4. Normalizes/validates the returned JSON, tracks token usage.

The model actually used is `settings.aiModel` (project can override via `project.aiModelOverride`) — see "Dynamic AI model list" below for where that value comes from.

**Dynamic AI model list**: `Settings > API Keys > Test connection` calls `testAnthropicApiKey()`, which walks Anthropic's `models.list()` (paginated, all pages) and caches the result into `settings.cachedAiModels`. `Settings > AI Model`'s dropdown reads `cachedAiModels ?? AVAILABLE_AI_MODELS` (the static fallback in `src/shared/constants/aiModels.ts`, used only before any key has ever been tested successfully).

## Settings & secrets

- `src/main/settings/settingsStore.ts` — everything in `AppSettings` (catalog path, preferred brands, AI model, font size, dismissed-update-version, cached model list, etc.) lives in one plain JSON file, `settings.json`, in `userData`. `getSettings()`/`updateSettings(patch)` are the only two functions that touch it.
- `src/main/settings/secretsStore.ts` — API keys are encrypted at rest via Electron's `safeStorage` (OS keychain-backed) into `secrets.json`, never plaintext, never logged. In dev only, a `.env` `ANTHROPIC_API_KEY` is used as a fallback if no key has been saved through the UI yet (`app.isPackaged` gates this off in production builds).

**Never read, decrypt, or otherwise programmatically extract a real stored secret** — treat `secrets.json`'s contents as off-limits even for debugging; use the in-app "Test connection" button instead.

## Error codes

`src/shared/errors/errorCodes.ts` is the single source of truth for every user-facing error: a short domain-prefixed code (`AUTH-006`, `AI-004`, `DB-001`, `CAT-005`, `FX-002`, `SEC-002`, `QT-001`, `GEN-...`) plus a plain-language message that never leaks internal detail. `AppError` (`src/main/errors/AppError.ts`) is how main-process code throws one of these intentionally; anything that throws a *raw* error instead gets caught and sanitized by `safeHandle` (see Architecture above). The full table is also rendered in-app at Settings > User Manual.

## Observability (debugging in a packaged build)

Since a packaged app has no visible console, unexpected errors and crashes are persisted to the `event_log` SQLite table instead:

- Every unexpected (non-`AppError`) error caught at the IPC boundary (`safeHandle`) gets a `level: 'error'` row.
- Main-process `uncaughtException`/`unhandledRejection` and renderer `render-process-gone`/`unresponsive` (`src/main/observability/crashHandlers.ts`) get `level: 'crash'` rows.
- **Settings > Diagnostics > Export diagnostic bundle** writes a JSON file (system info + recent `event_log` rows) to a location you pick — purely local, nothing is ever uploaded automatically. Ask a beta tester for this file when debugging a report you can't reproduce.

## Running the app

```bash
npm install
npm run dev              # hot-reloading dev build
npm run build             # typecheck + production build (out/)
npm run build:win         # full Windows installer (dist/*.exe)
npm run test               # plain Node vitest suite (pure logic, no Electron/DB)
npm run test:db            # Electron-runtime vitest suite (*.dbtest.ts — real SQLite, real migrations)
npm run test:all           # both suites
npm run typecheck          # tsc, no emit, both node and web tsconfigs
npm run lint                # eslint --cache .
npm run verify:installer   # full real install/launch/uninstall cycle, see scripts/verify-installer.ps1
npm run release              # standard-version: bump package.json, update CHANGELOG.md, tag
```

### Testing conventions (important — read before adding a test)

Two separate Vitest configs, and the split is deliberate:
- **`*.test.ts`** (`npm run test`) — pure logic, no Electron APIs, no database. Runs under plain Node. Example: `src/main/settings/aiModelResolver.test.ts`.
- **`*.dbtest.ts`** (`npm run test:db`) — anything touching `getDb()`/`app.*`. Runs *through the `electron` binary itself* with `ELECTRON_RUN_AS_NODE=1` (see `vitest.electron.config.ts`), because this project's `better-sqlite3` native binary is rebuilt against Electron's Node ABI, not the system Node's — plain `node` cannot `require()` it (`NODE_MODULE_VERSION` mismatch). Each test gets an isolated `:memory:` database (`EQOUTATION_DB_PATH=:memory:`, set only by the test config, never in a real build).

This codebase has **zero `vi.mock()` usage anywhere** — that's a deliberate convention, not an oversight. Tests use a real (in-memory) database rather than mocking the DB layer. Files that only wrap external network calls (`ClaudeProvider.ts`, `frankfurterClient.ts`) or Electron dialogs (every `ipc/*.ts` file, every `export/*.ts` file) have **no automated tests at all** — they're verified live, by running the app. If you're adding logic to one of those files, pull the actual decision-making into a small pure function in its own file (see `src/main/settings/aiModelResolver.ts` or `src/main/updateCheck/updateCheck.ts`'s `isNewerVersion`) so *that* can be unit tested, and leave the IO wrapper untested like its neighbors.

## Debugging

- **Renderer**: DevTools open automatically in `npm run dev` (F12 to toggle). `console.log` in any `.tsx`/renderer `.ts` file shows here.
- **Main process**: `console.log`/`console.error` in `src/main/**` print to the terminal you ran `npm run dev` from — there is no DevTools for the main process.
- **Database**: `%APPDATA%\eqoutation\eqoutation.sqlite` (dev and packaged both use the real `userData` path unless `EQOUTATION_DB_PATH` is set). Inspect it directly with any SQLite browser, or query it via `electron` in Node-compat mode from the repo root: `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron.cmd -e "const Database=require('better-sqlite3'); const db=new Database('<path>', {readonly:true}); console.log(db.prepare('SELECT * FROM event_log ORDER BY created_at DESC LIMIT 20').all())"`.
- **A packaged build behaving differently from dev**: check `electron-builder.yml`'s `files`/`asarUnpack` lists first — packaging excludes dev-only files and unpacks native modules (`better-sqlite3`) out of the asar archive; a bug that only reproduces packaged is almost always a path-resolution or asar issue, not application logic. `npm run verify:installer` exists specifically to catch this class of bug before it reaches a beta tester.
- **Something that only fails for one specific SLD/PDF**: check Settings > Diagnostics for a bundle, and check the `annotations`/`extractions` tables for that SLD's raw stored extraction JSON.

### Known gotchas

- **`pdfjs-dist` must stay at `4.10.38`.** Newer versions break rendering in this app — do not `npm update` past it.
- **`tsconfig.node.json`/`tsconfig.web.json` composite builds**: if you see `preload/index.d.ts` getting silently overwritten/corrupted, check `outDir` isolation in both tsconfigs — this has happened once before (see git history around `bug_tsconfig_composite_overwrite`).
- **Never run PowerShell `$env:X` syntax through the Bash tool/a bash shell** — it silently expands to a bogus path instead of erroring. Use PowerShell directly for anything touching `%APPDATA%`/`%LOCALAPPDATA%`.
- **The one-click NSIS installer's per-user install folder is `%LOCALAPPDATA%\Programs\eqoutation`** (lowercase, from `package.json`'s `"name"`) — not `eQuotation` (that's only the `productName`/executable/shortcut display name).

## Release workflow

1. Land your changes on `master` with conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`, ...).
2. `npm run release` — bumps `package.json` version (plain semver, no prerelease suffix), regenerates `CHANGELOG.md`, commits, tags `vX.Y.Z`.
3. `git push --follow-tags`.
4. Ensure `GH_TOKEN` (a personal token with `repo` scope — e.g. `gh auth token`) is set in your shell, then run `npm run build:win:publish`. This builds, then uploads the installer and `latest.yml` to a real GitHub Release for the tag — this is what makes the app-side self-update actually see the new version. Use plain `npm run build:win` (no publish) for local testing/`npm run verify:installer` runs.
5. Testers (added as read-only GitHub collaborators on this private repo) either wait for the in-app update notice or download manually from the Releases page.

### How self-update works (for debugging)

Uses `electron-updater`'s GitHub provider (`src/main/updater/autoUpdater.ts`), authenticated against this private repo with a fine-grained, read-only, repo-scoped token embedded at build time via `MAIN_VITE_UPDATE_TOKEN` (see `.env.example`) — electron-vite's built-in `MAIN_VITE_`-prefixed env convention compiles it into the main-process bundle (typed via `src/main/env.d.ts`), distinct from and unrelated to the runtime `.env` loading (`loadEnv()` in `main/index.ts`) used for the dev-only Anthropic key.

- **On launch and on manual "Check for Updates"**, `checkForUpdate()` calls `autoUpdater.checkForUpdates()`, which fetches `latest.yml` from the repo's most recent GitHub Release. `update-available`/`update-not-available` events populate an in-memory cache, read by both the TopBar pill and Settings → About via the shared `useUpdateCheck()` query — one cache, two UI surfaces, same as before.
- **`electron-updater` only does anything in a packaged build.** `autoUpdater.checkForUpdates()` is a silent no-op (resolves without checking, no event fires) whenever `app.isPackaged` is false — i.e. always in `npm run dev`. This is `electron-updater`'s own built-in behavior, not something this app's code added. Don't mistake "always shows Not checked yet in dev" for a bug — it's expected, and matches the still-best-effort, never-block posture of the launch-time call.
- **Nothing downloads automatically.** Clicking "Update Now" (Settings) or the TopBar pill itself calls `window.confirm(...)`, then `downloadUpdate()` → `autoUpdater.downloadUpdate()`. Progress streams to the renderer via the `app:updateDownloadProgress` push event, shown as "Downloading… NN%" on both surfaces.
- **Install is automatic once downloaded** — no second confirmation. `autoUpdater`'s `update-downloaded` event calls `quitAndInstall()` directly; the app closes and relaunches on the new version on its own.

**How to test a real self-update end-to-end** (needs an actual published release — not something a unit test can cover, and won't do anything in `npm run dev` per the note above):

1. Make sure a local `.env` has a real `MAIN_VITE_UPDATE_TOKEN` — create a GitHub fine-grained token scoped to just this repo, permission `Contents: Read-only` (Settings → Developer settings → Fine-grained tokens) — and that `GH_TOKEN` is set in your shell.
2. Install the *current* released version on a test machine/VM (or just use your current dev install).
3. Bump the version and publish a real new release: `npm run release` → `git push --follow-tags` → `npm run build:win:publish`.
4. On the test install, open Settings → About and click "Check for Updates" (or just relaunch — the launch-time check will find it too).
5. Confirm the "Update Now"/TopBar pill appears with the new version number, click it, confirm the `window.confirm` dialog, and watch the download percentage climb.
6. Confirm the app quits and relaunches automatically once the download completes, and that `About` now shows the new version.

**Debugging checklist:**
- **"Check for Updates always fails" / 401-shaped errors in the console:** the embedded token is missing, expired, or was revoked — regenerate it on GitHub and rebuild with `build:win:publish` using the new value in `.env`.
- **"No update found even though a newer tag/version exists":** confirm a *GitHub Release* (not just a git tag) exists for that version with `latest.yml` and the installer attached — `npm run release` only tags; only `npm run build:win:publish` actually publishes a Release. `gh release list --repo Elias-Brendon/Qoutation` shows what's actually published.
- **"Check for Updates does nothing in dev mode":** expected — see the no-op note above. Self-update only activates in a packaged build; testing it requires a real installed build, not `npm run dev`.
- **Download starts but fails partway:** almost always a network interruption — `didFail`/"Update failed to download — try again" surfaces this in both UI surfaces; the user can just click again.
- **App doesn't relaunch after "Downloading… 100%"**: check the main-process console for the `update-downloaded` handler's `quitAndInstall()` call — a code-signing mismatch between the installed version and the new installer is the most common real-world cause (this app doesn't currently code-sign, so this is unlikely to bite in this project specifically, but worth knowing if that ever changes).

## Where things live (quick reference)

| I want to... | Look at |
|---|---|
| Add a new IPC call | `src/shared/types/ipc-contract.ts`, matching `src/main/ipc/*.ipc.ts`, `src/preload/index.ts`, matching `src/renderer/src/state/queries/*.ts` |
| Add a DB column/table | `src/main/db/migrations/00XX_*.ts` + `index.ts`, matching repo in `src/main/db/repositories/` |
| Change an error message | `src/shared/errors/errorCodes.ts` |
| Change the extraction prompt/schema | `src/main/ai/promptTemplates.ts`, `src/main/ai/extractionSchema.ts` |
| Add a Settings page section | `src/renderer/src/components/settings/sections/*.tsx` + wire into `SettingsPage.tsx` |
| Change what's excluded from the installer | `electron-builder.yml`'s `files` list |
| See every design decision and why | `docs/superpowers/specs/*.md` (chronological) |
| See every implementation plan (code-level detail) | `docs/superpowers/plans/*.md` (chronological) |
