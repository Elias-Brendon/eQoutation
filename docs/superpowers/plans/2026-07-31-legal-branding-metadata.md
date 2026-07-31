# Legal & Branding Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app proper license/copyright/author metadata and a Settings > About panel disclosing beta status and external data handling, before it goes to beta testers.

**Architecture:** Static metadata changes to `package.json`, a new `LICENSE` file, and `electron-builder.yml`'s `copyright` field. One new minimal `app:getVersion` IPC channel (main → renderer) backs a new read-only `AboutSection` in Settings that otherwise renders static disclosure text.

**Tech Stack:** Electron main process (`safeHandle` IPC pattern), React 19 + TypeScript renderer, TanStack Query.

## Global Constraints

- Full spec: `docs/superpowers/specs/2026-07-31-legal-branding-metadata-design.md`.
- License: Proprietary / All Rights Reserved. Copyright holder: "Elias Brendon". Copyright year: 2026.
- No formal EULA acceptance gate — the disclosure is a passive Settings panel, not a launch-time modal.
- No automated tests for this sub-project (pure static content + a one-line IPC wrapper — see spec's Testing section for why).
- Follow existing patterns exactly: the `safeHandle` IPC pattern (`src/main/ipc/safeHandle.ts`), the one-file-per-domain IPC registration convention (`src/main/ipc/index.ts`), and the existing Settings section component shape (e.g. `FontSizeSection.tsx` — a `useQuery`-backed value plus static JSX, no form state).

**Existing code this plan depends on (current state, unchanged by this plan):**

```ts
// src/main/ipc/safeHandle.ts
export function safeHandle<Args extends unknown[], R>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => R | Promise<R>
): void

// src/main/ipc/index.ts — registerAllIpc() calls one register*Ipc() per domain file

// src/renderer/src/state/queries/useSettings.ts — pattern reference:
export function useSettings(): UseQueryResult<AppSettings> {
  return useQuery({ queryKey: settingsQueryKey, queryFn: () => window.api.settings.get() })
}
```

---

### Task 1: Package metadata and LICENSE file

**Files:**
- Modify: `package.json`
- Create: `LICENSE`

**Interfaces:** None — pure metadata, nothing consumed by later tasks.

- [ ] **Step 1: Update `package.json`**

Change the `"author"` field (currently `"Elias"`) to:

```json
  "author": "Elias Brendon",
```

Add a `"license"` field right after `"description"`:

```json
  "description": "Switchboard manufacturing quotation generator",
  "license": "UNLICENSED",
```

- [ ] **Step 2: Create the `LICENSE` file**

Create `LICENSE` at the repo root:

```
Copyright (c) 2026 Elias Brendon
All rights reserved.

This software and associated documentation files (the "Software") are
proprietary and confidential. Unauthorized copying, modification,
distribution, or use of this Software, via any medium, is strictly
prohibited without the express written permission of the copyright holder.

No license, express or implied, to any intellectual property rights is
granted by this document.
```

- [ ] **Step 3: Verify**

Run: `cat package.json` (or open it) — confirm `"author": "Elias Brendon"` and `"license": "UNLICENSED"` are present and the JSON is still valid (no trailing commas).

Run: `npm run typecheck` — confirm it still passes (this task doesn't touch any TypeScript, but it's a cheap sanity check that nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add package.json LICENSE
git commit -m "chore: add proprietary LICENSE and correct author metadata"
```

---

### Task 2: electron-builder copyright field

**Files:**
- Modify: `electron-builder.yml`

**Interfaces:** None.

- [ ] **Step 1: Add the `copyright` field**

In `electron-builder.yml`, add a top-level `copyright` key. Insert it right after `productName: eQuotation`:

```yaml
appId: com.elias.equotation
productName: eQuotation
copyright: Copyright © 2026 Elias Brendon
directories:
  buildResources: build
```

- [ ] **Step 2: Verify**

Run: `python -c "import yaml; d = yaml.safe_load(open('electron-builder.yml')); print(d['copyright'])"`
Expected output: `Copyright © 2026 Elias Brendon`

- [ ] **Step 3: Commit**

```bash
git add electron-builder.yml
git commit -m "chore: add copyright metadata to the installer build config"
```

---

### Task 3: `app:getVersion` IPC channel

**Files:**
- Modify: `src/shared/types/ipc-contract.ts`
- Create: `src/main/ipc/app.ipc.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: Electron's built-in `app.getVersion()` (reads `package.json`'s `version` field automatically).
- Produces (consumed by Task 4):

```ts
// window.api.app.getVersion, callable from the renderer
getVersion(): Promise<string>
```

- [ ] **Step 1: Add the IPC channel name**

In `src/shared/types/ipc-contract.ts`, add a new line. Since this is the first channel for a new "app" domain, add it right after the opening `export const IPC = {` line, before `authGetStatus`:

```ts
export const IPC = {
  appGetVersion: 'app:getVersion',
  authGetStatus: 'auth:getStatus',
```

- [ ] **Step 2: Create the handler**

Create `src/main/ipc/app.ipc.ts`:

```ts
import { app } from 'electron'
import { safeHandle } from './safeHandle'
import { IPC } from '@shared/types/ipc-contract'

export function registerAppIpc(): void {
  safeHandle(IPC.appGetVersion, (): string => app.getVersion())
}
```

- [ ] **Step 3: Register it**

In `src/main/ipc/index.ts`, add the import after the existing imports (alphabetical position doesn't matter here since the file isn't currently sorted, but place it first for visibility as the newest/foundational domain):

```ts
import { registerAppIpc } from './app.ipc'
import { registerAuthIpc } from './auth.ipc'
```

Add the call as the first line inside `registerAllIpc()`:

```ts
export function registerAllIpc(): void {
  registerAppIpc()
  registerAuthIpc()
```

- [ ] **Step 4: Expose it in preload**

In `src/preload/index.ts`, add a new top-level `app: { ... }` entry to the `api` object. Insert it as the first property, right after `const api = {`:

```ts
const api = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.appGetVersion)
  },
  auth: {
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck:node`
Expected: no errors.

Run: `npm run typecheck:web`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/ipc-contract.ts src/main/ipc/app.ipc.ts src/main/ipc/index.ts src/preload/index.ts
git commit -m "feat: add app:getVersion IPC channel"
```

---

### Task 4: `useAppVersion` renderer hook

**Files:**
- Create: `src/renderer/src/state/queries/useApp.ts`

**Interfaces:**
- Consumes: `window.api.app.getVersion()` (Task 3).
- Produces (consumed by Task 5):

```ts
export function useAppVersion(): UseQueryResult<string>
```

- [ ] **Step 1: Create the hook**

Create `src/renderer/src/state/queries/useApp.ts`:

```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

export function useAppVersion(): UseQueryResult<string> {
  return useQuery({
    queryKey: ['app', 'version'],
    queryFn: () => window.api.app.getVersion(),
    staleTime: Infinity
  })
}
```

(`staleTime: Infinity` because the running app's version cannot change without a restart — no point refetching it.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/state/queries/useApp.ts
git commit -m "feat: add useAppVersion renderer hook"
```

---

### Task 5: About section in Settings

**Files:**
- Create: `src/renderer/src/components/settings/sections/AboutSection.tsx`
- Modify: `src/renderer/src/components/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: `useAppVersion` (Task 4).
- Produces: nothing consumed by later tasks — this is the final UI wiring for this sub-project.

- [ ] **Step 1: Create `AboutSection.tsx`**

```tsx
import { AlertTriangle } from 'lucide-react'
import { useAppVersion } from '@renderer/state/queries/useApp'

export function AboutSection(): React.JSX.Element {
  const { data: version } = useAppVersion()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">About</h3>
        <p className="mt-1 text-xs text-text-secondary">
          eQuotation{version ? ` v${version}` : ''}
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <p className="font-semibold">Beta software</p>
          <p className="mt-0.5">
            This is a beta release — expect bugs. Use for evaluation, not production-critical
            work without a backup.
          </p>
        </div>
      </div>

      <div>
        <h4 className="mb-1.5 text-xs font-semibold text-text-primary">Data handling</h4>
        <ul className="flex flex-col gap-1 text-xs text-text-secondary">
          <li>
            • SLD PDFs you upload are sent to Anthropic's Claude API for component extraction.
          </li>
          <li>• Currency conversion queries Frankfurter's public API.</li>
          <li>• All project data is stored locally on this machine.</li>
          <li>• No data is sent to the developer or any other third party.</li>
        </ul>
      </div>

      <p className="text-xs text-text-muted">© 2026 Elias Brendon. All rights reserved.</p>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `SettingsPage.tsx`**

Add the import after the `UserManualSection` import:

```ts
import { UserManualSection } from './sections/UserManualSection'
import { AboutSection } from './sections/AboutSection'
```

Add `'about'` to the `SectionId` union (after `'userManual'`):

```ts
  | 'userManual'
  | 'about'
```

Add the nav entry (after the `userManual` entry) in `NAV_ITEMS`:

```ts
  { id: 'userManual', label: 'User Manual' },
  { id: 'about', label: 'About' }
```

Add the render branch (after the `userManual` branch):

```tsx
          {activeSection === 'userManual' && <UserManualSection />}
          {activeSection === 'about' && <AboutSection />}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `npx eslint src/renderer/src/components/settings/sections/AboutSection.tsx src/renderer/src/components/settings/SettingsPage.tsx`
Expected: no errors (pre-existing unrelated CRLF warnings elsewhere in the repo are not from this task — same check used throughout this roadmap's prior items).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/settings/sections/AboutSection.tsx src/renderer/src/components/settings/SettingsPage.tsx
git commit -m "feat: add About section to Settings with beta and data-handling disclosure"
```

---

### Task 6: Live verification

**Files:** none (manual verification only — no code changes).

- [ ] **Step 1: Start the app**

Run: `npm run dev`. This plan touches `src/main/` (new IPC file) and `src/preload/`, so if a dev server is already running, restart it — main-process/preload changes don't reliably hot-reload in this codebase.

- [ ] **Step 2: Confirm the About panel**

Open Settings > About. Confirm:
- Version number shown matches `package.json`'s `"version"` field (`0.1.0` unless it's changed since this plan was written).
- The "Beta software" warning box renders with the warning-tone styling (border/background/icon), not plain text.
- All four "Data handling" bullet points are present.
- The copyright line reads exactly `© 2026 Elias Brendon. All rights reserved.`

- [ ] **Step 3: Confirm the files on disk**

Run: `cat LICENSE` — confirm it reads correctly and names "Elias Brendon" as the copyright holder.

Run: `grep -A1 '"description"' package.json` — confirm `"license": "UNLICENSED"` appears right after the description line, and `grep '"author"' package.json` confirms `"Elias Brendon"`.

- [ ] **Step 4: Report results and update roadmap memory**

If everything passes, report to the user. Update the `project_remaining_stages_roadmap` memory file: mark beta-packaging sub-project 1 (legal & branding metadata) complete, and set "next up" to sub-project 2 (version system + no-hardcoded-paths audit).
