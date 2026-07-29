# eQuotation — Industry-Grade Refinement Plan

Refining your prototype notes into a build-ready spec. One assumption up front: I'm treating "full tab / minimize" as **in-app panel states** (expand a panel to fill the workspace, or collapse it to a strip/sidebar), not OS-level browser tabs — since AI Result and PDF are clearly meant to sit side-by-side and toggle dominance. Flag me if you actually meant separate windows/tabs.

---

## 1. Settings Page

| Section | What it needs | Notes / gaps to close |
|---|---|---|
| **Theme** | Light / Dark / System | Standard — also drives PDF annotation contrast (see §4) |
| **Catalog Path** | File/folder picker pointing to where product catalog data lives | Needs validation on save (path exists, readable, correct format) and a "last synced" timestamp. What format is the catalog — Excel, CSV, a database, or a folder of vendor PDFs? This decides whether it's a path picker or a connection string. |
| **Preferred Brands** | Multi-select list, but **scoped to brands actually present in the loaded catalog** — not a static hardcoded list | This depends on Catalog Path being loaded first. Order of operations: Catalog Path → parse → populate Preferred Brands from what's found. If catalog isn't loaded yet, this section should show "Load a catalog first" instead of an empty list. |
| **Components** | Manage the component types the AI is allowed to detect (MCCB, MCB, ACB, MPCB, RCCB, ELCB, RCBO, contactors, meters, etc.) | This is where you resolve the earlier open question — "include contactors/meters/pilot lamps?" — as a toggleable list instead of a hardcoded yes/no. Also lets you add custom component types without touching the AI prompt. |
| **User Log In** | Username + Password fields, with a "Remember me" checkbox | For MVP this is a real credential form, not just a Guest/Account toggle — but it can still sit on top of a single-operator model underneath (i.e., one local account, no server-side multi-tenancy yet). "Remember me" should persist a session token locally, not the password itself. This is the seed for the fuller multi-user/role system in the roadmap below. |
| **API Keys** | Claude API key (and any pricing/vendor API keys) | Store encrypted at rest (OS keychain if desktop, encrypted column if web+DB) — never log or echo back the full key, show masked with last 4 chars. Add a "Test connection" button. |
| **AI Model** | Dropdown of models available from the connected API provider (e.g., Haiku for batch extraction vs Sonnet for verification — matches your earlier accuracy strategy), confidence threshold for auto-flagging, max retries/consensus runs | This is where the "flag low-confidence items for review" behavior from your accuracy strategy gets user-tunable instead of hardcoded. Populate the dropdown dynamically from the provider once an API key is validated, rather than hardcoding model names — providers add/deprecate models over time. |
| **Margins** | Default markup/margin % applied over catalog cost when generating a quotation — global default, with per-quotation override | Needs a clear split between "cost price" (from catalog) and "sell price" (cost + margin) throughout the BOM/quotation views, so margin logic lives in one place instead of being recalculated ad hoc per screen. Decide here whether margin is a flat % or can vary by component category/brand. |
| **Font Size** | Small / Medium / Large, or a slider | Apply as a root scale (rem-based), not per-component overrides, so it doesn't break layout. |
| **User Manual** | In-app help/documentation entry point (searchable docs, or an embedded PDF/markdown viewer) | Not a config toggle like the rest of the page — more of a link/launcher. Worth deciding now whether this is static content shipped with the app or something you'll want to update independently of app releases (favors a hosted doc over a bundled file). |
| **Admin** | Entry point to admin-level settings — currently just a placeholder until roles exist (see roadmap below), but reserve the settings-page slot now | For MVP with a single operator this can just be "manage my account" (change password, reset API keys). Once roles ship, this becomes the real admin console (manage users, view audit trail, set org-wide defaults). |

**Suggested order in the Settings UI:** Catalog Path → Preferred Brands → Components → AI Model → API Keys → Margins → User Log In → Theme → Font Size → User Manual → Admin. Reasoning: catalog and brand config affect what AI/Components can even reference, so they should sit above the AI section; Margins sits near AI/Catalog since it's core to quotation output; User Manual and Admin sit last since they're not day-to-day tuning knobs.

---

## 2. AI Result Tab — Full / Minimize

- **Minimized (default):** side panel or bottom drawer showing BOM/quotation results alongside the PDF, so the user can cross-reference while working.
- **Full:** expands to occupy the whole workspace for detailed review — useful when checking a long BOM line-by-line or exporting.
- Toggle via a single expand/collapse icon (top-right of the panel), not a separate settings option — this should be a per-session UI action, not a persisted preference, since the need varies BOM-to-BOM.
- When full: PDF panel should still be reachable via a quick "peek" (hover or hotkey) rather than fully hidden, so users aren't blind-flipping back and forth to check a number against the drawing.

---

## 3. Flag → Resolve on Double-Click

- Any BOM line item flagged low-confidence (per your earlier verification-pass design) becomes double-clickable.
- Double-click opens a **Resolve panel** (inline drawer, not a full modal, so context isn't lost) showing:
  - The cropped region of the source PDF the value was extracted from
  - The AI's extracted value + confidence score
  - An editable field for the corrected value
  - Accept / Override / Flag-for-later actions
- On resolve: mark the line item as human-verified, and log the correction. This log becomes your eval-set ground truth over time — the exact "manually verified BOM" data source your accuracy strategy needs, generated as a side effect of normal use instead of a separate labeling effort.
- Single-click should just select/highlight the row (for scrolling to the PDF region); double-click is reserved for entering resolve mode, so users don't accidentally open it while scanning the list.

---

## 4. PDF Panel — Full / Mini + Annotation

**Full/Mini** mirrors the AI Result panel behavior in §2 — same toggle pattern, same "peek" affordance in reverse.

**Annotation toolset:**
| Tool | Behavior |
|---|---|
| Brush | Freehand draw, adjustable size via slider or preset (S/M/L) |
| Circle | Click-drag to draw an ellipse/circle outline |
| Rectangle | Click-drag to draw a box outline |
| Text | Click to place a text box, typed directly on the canvas |

Implementation notes:
- Store annotations as a **separate overlay layer** (vector JSON: shape type, coordinates, color, text content) keyed to page number and zoom-independent coordinates — never burn them into the PDF file itself. This keeps the source drawing untouched and lets annotations be toggled on/off, exported, or synced to the Resolve flow in §3 (e.g., an annotation circling the exact spot the AI misread).
- Undo/redo stack for annotations, and a clear-all-on-this-page action.
- Color should default to something that reads against both light and dark theme (see §1) — an accent color, not pure red/black which can clash or become invisible in dark mode.

---

## 5. Additional Features — Post-MVP Roadmap

These extend the MVP settings/features above into a fuller product. Listed roughly in the order they'd unlock value, not necessarily build order.

| Feature | What it adds | Why it matters / dependency |
|---|---|---|
| **Multi-user roles + audit trail** | Admin / Estimator / Viewer roles, with permissions (e.g., only Admin edits Margins/API Keys; Estimator generates quotations; Viewer is read-only), plus a log of who changed what and when | Directly upgrades the MVP's single-credential **User Log In** and placeholder **Admin** entry into a real permission model. The audit trail also naturally absorbs the correction log from §3 (Flag → Resolve), so you get one audit surface instead of two. |
| **Price versioning on Catalog Path** | Track price changes over time per SKU/item, not just the current snapshot — so a quotation generated in March can be reconstructed with March's prices even after the catalog updates | Requires Catalog Path (MVP) to move from "load current file" to "ingest with timestamped history," e.g., an append-only price table rather than overwrite-on-sync. Also protects quotation integrity if a customer disputes pricing later. |
| **Interactive busbar/cable calculator** | Exposes the sizing logic the AI already uses internally (busbar current rating, cable sizing) as a standalone calculator tool the user can run independently of a BOM extraction | Useful as a quick sanity-check or standalone sales tool, and gives you a place to validate the AI's internal math against a transparent, user-facing version of the same formulas. |
| **Live distributor price feed** | Pulls real-time pricing from 1–2 distributor APIs/portals to start, expanding brand coverage over time | Natural pairing with Price Versioning above — a live feed is what actually populates the price history instead of manual catalog reloads. Start narrow (1–2 brands) since each distributor integration is its own auth/rate-limit/format problem. |
| **Compliance-stamped PDF output** | Quotation export includes IS/IEC 61439-style formatting: scope of supply, terms & conditions, GST/tax block, signatory space | This is a template/layout addition to the export pipeline, not a data-model change — but it does mean the quotation data model needs to carry a few extra fields (tax rate, signatory name/title, T&C text block) that the MVP export may not need. |
| **Annotation-linked corrections** | Ties the PDF annotation tools (§4) directly into the Flag → Resolve flow (§3) — e.g., a user circles the exact busbar on the drawing that the AI misread, and that annotation is saved as part of the correction record | Both pieces (annotations, Resolve panel) already exist independently in the MVP plan; this is the integration step connecting them. It turns every correction into a visual, auditable record — "here's exactly what was missed and where" — which strengthens the eval-set ground truth described in §3 and is a meaningful differentiator, since this isn't something competitor tools appear to offer. |

---

## Open questions before this goes into build

1. **Platform:** is eQuotation a desktop app (Electron/Tauri) or a web app? Changes how API keys are stored (OS keychain vs encrypted DB column) and whether "full tab" could ever mean a real OS window.
2. **Catalog format:** structured database, Excel/CSV import, or vendor PDF catalogs parsed by AI? This decides whether Catalog Path is a simple file picker or a full import/sync pipeline.
3. **Multi-user:** is this single-operator MVP, or do you want the Multi-user roles + audit trail (§5) built in from the start? Affects whether User Log In ships as the simple username/password form or the fuller role-based system from day one.
4. **Distributor integrations:** which 1–2 distributors/brands should the live price feed (§5) target first? Likely driven by whichever brands make up the bulk of your current quotation volume.

Happy to turn any of these sections into actual schema/UI wireframes next — just say which one.
