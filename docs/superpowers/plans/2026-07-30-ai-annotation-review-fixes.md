# AI Annotation Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix visual/interaction problems found reviewing the just-shipped bounding-box AI annotations live: boxes of identical color visually merge into an indistinguishable blob when several land near each other, the corner badge is large enough to obscure the schematic underneath, hover-based info discovery is unreliable, and there's no way to hide AI annotations when they're in the way.

**Architecture:** `createAiAnnotation` assigns each box a color from a fixed 6-color theme-consistent palette (cycled by creation order) instead of one fixed accent color. `AnnotationCanvas.tsx` gets a smaller/thinner box style, a click-triggered info popover (replacing the native `title` hover tooltip) with its own local open/closed state, and a `showAiAnnotations` prop that hides the whole `aiBoxes` layer when off. `PdfViewer.tsx` owns that boolean in a small piece of state, toggled by a new toolbar button.

**Tech Stack:** Electron main process (better-sqlite3), React 19 renderer, Vitest.

## Global Constraints

- No change to human-authored annotation tools (freehand/pin/circle/rectangle/text, undo/redo, clear-page) — everything here is scoped to `authorType === 'ai'` rendering and the one repo function that creates AI annotations.
- No backfill — existing AI annotations (pins from the first pass, single-accent-color rectangles from the second pass) keep whatever color/shape they already have. Only new annotations get the palette treatment. Consistent with the established "no backfill" policy for this feature.
- DB-touching tests are `*.dbtest.ts` run via `npm run test:db`.

---

### Task 1: Distinct color per AI annotation (theme-consistent palette)

**Files:**
- Modify: `src/main/db/repositories/annotationsRepo.ts`
- Modify: `src/main/db/repositories/annotationsRepo.dbtest.ts`

**Interfaces:**
- Produces (consumed by Task 2 — rendering, no change needed there since color is already read from the row): `createAiAnnotation`'s color is now one of 6 palette values instead of always `var(--color-accent)`. `createAiAnnotationsForFlags` cycles the palette by creation order across the whole call (not per-page), so adjacent boxes on the same page are unlikely to repeat.

- [ ] **Step 1: Update the test expecting a single fixed color**

In `src/main/db/repositories/annotationsRepo.dbtest.ts`, replace the assertion:

```ts
    expect(annotation.color).toBe('var(--color-accent)')
```

with:

```ts
    expect(AI_ANNOTATION_COLOR_PALETTE).toContain(annotation.color)
```

Add `AI_ANNOTATION_COLOR_PALETTE` to the import from `./annotationsRepo`.

Add a new test in the `createAiAnnotationsForFlags` describe block:

```ts
  it('cycles through the color palette so consecutive annotations differ', () => {
    const { sldId, quotationId } = createProjectSldQuotation()
    const flags = createFlags(quotationId, [
      { origin: 'ai', message: 'a', pageNumber: 1 },
      { origin: 'ai', message: 'b', pageNumber: 1 },
      { origin: 'ai', message: 'c', pageNumber: 1 }
    ])

    createAiAnnotationsForFlags(sldId, flags, [null, null, null])

    const annotations = listAnnotationsBySld(sldId)
    const colors = annotations.map((a) => a.color)
    expect(colors[0]).not.toBe(colors[1])
    expect(colors[1]).not.toBe(colors[2])
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:db`
Expected: FAIL — `AI_ANNOTATION_COLOR_PALETTE` isn't exported yet, and all annotations still get the same fixed color.

- [ ] **Step 3: Implement the palette**

In `src/main/db/repositories/annotationsRepo.ts`, replace:

```ts
const AI_ANNOTATION_COLOR = 'var(--color-accent)'
```

with:

```ts
export const AI_ANNOTATION_COLOR_PALETTE = [
  'var(--color-accent)',
  'var(--color-info)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-danger)',
  '#a855f7'
] as const
```

Update `CreateAiAnnotationInput` to accept a `colorIndex`:

```ts
export interface CreateAiAnnotationInput {
  sldId: string
  pageNumber: number
  commentText: string
  linkedFlagId: string
  boundingBox: AnnotationBoundingBox | null
  /** Only used when boundingBox is null, to stack the fallback box. Defaults to 0. */
  fallbackIndexOnPage?: number
  /** Cycles through AI_ANNOTATION_COLOR_PALETTE so nearby boxes are visually distinct. */
  colorIndex: number
}
```

In `createAiAnnotation`, replace the row's `color: AI_ANNOTATION_COLOR` with:

```ts
    color: AI_ANNOTATION_COLOR_PALETTE[input.colorIndex % AI_ANNOTATION_COLOR_PALETTE.length],
```

In `createAiAnnotationsForFlags`, add a running counter and pass it through:

```ts
export function createAiAnnotationsForFlags(
  sldId: string,
  flags: Flag[],
  boundingBoxes: (AnnotationBoundingBox | null)[]
): void {
  const fallbackCountByPage = new Map<number, number>()
  let colorIndex = 0
  flags.forEach((flag, i) => {
    if (flag.origin !== 'ai' || flag.pageNumber === null) return
    const boundingBox = boundingBoxes[i] ?? null
    let fallbackIndexOnPage: number | undefined
    if (!boundingBox) {
      fallbackIndexOnPage = fallbackCountByPage.get(flag.pageNumber) ?? 0
      fallbackCountByPage.set(flag.pageNumber, fallbackIndexOnPage + 1)
    }
    try {
      createAiAnnotation({
        sldId,
        pageNumber: flag.pageNumber,
        commentText: flag.message,
        linkedFlagId: flag.id,
        boundingBox,
        fallbackIndexOnPage,
        colorIndex: colorIndex++
      })
    } catch (err) {
      console.error('[annotationsRepo] failed to create AI annotation for flag', flag.id, err)
    }
  })
}
```

(`colorIndex++` only advances for flags that actually get an annotation, since it's inside the same early-return guard — flags skipped via `return` never consume a palette slot.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:db`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/repositories/annotationsRepo.ts src/main/db/repositories/annotationsRepo.dbtest.ts
git commit -m "feat: cycle AI annotations through a theme color palette instead of one fixed color"
```

---

### Task 2: Thinner/smaller box styling, click-to-show info popover, visibility toggle prop

**Files:**
- Modify: `src/renderer/src/components/pdf/AnnotationCanvas.tsx`

**Interfaces:**
- Produces (consumed by Task 3 — `PdfViewer.tsx`): `AnnotationCanvasProps.showAiAnnotations: boolean` (new prop).

- [ ] **Step 1: Add local state for the click-triggered info popover, and the new prop**

Add `useState` to the React import (`import { useEffect, useRef, useState } from 'react'`).

Add to `AnnotationCanvasProps` and the destructured params:

```ts
interface AnnotationCanvasProps {
  cssWidth: number
  cssHeight: number
  annotations: Annotation[]
  liveStroke: AnnotationPoint[] | null
  liveShape: LiveShape | null
  liveColor: string
  liveStrokeWidth: number
  onMarkerClick: (annotation: Annotation) => void
  highlightedAnnotationId: string | null
  showAiAnnotations: boolean
}

export function AnnotationCanvas({
  cssWidth,
  cssHeight,
  annotations,
  liveStroke,
  liveShape,
  liveColor,
  liveStrokeWidth,
  onMarkerClick,
  highlightedAnnotationId,
  showAiAnnotations
}: AnnotationCanvasProps): React.JSX.Element {
```

Add local state right after the existing `canvasRef`/`dpr` lines:

```ts
  const [infoOpenId, setInfoOpenId] = useState<string | null>(null)
```

- [ ] **Step 2: Gate the `aiBoxes` collection on the visibility toggle**

Change:

```ts
  const aiBoxes = annotations.filter(
    (a) => a.authorType === 'ai' && a.shapeType === 'rectangle' && a.points.length === 2
  )
```

to:

```ts
  const aiBoxes = showAiAnnotations
    ? annotations.filter(
        (a) => a.authorType === 'ai' && a.shapeType === 'rectangle' && a.points.length === 2
      )
    : []
```

- [ ] **Step 3: Replace hover-title with a click-triggered info popover, thinner border, smaller badge**

Replace the entire `{aiBoxes.map((box) => { ... })}` block with:

```tsx
      {aiBoxes.map((box) => {
        const [a, b] = box.points
        const left = Math.min(a.x, b.x) * 100
        const top = Math.min(a.y, b.y) * 100
        const width = Math.abs(b.x - a.x) * 100
        const height = Math.abs(b.y - a.y) * 100
        const isInfoOpen = infoOpenId === box.id
        return (
          <div
            key={box.id}
            className="pointer-events-none absolute"
            style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                onMarkerClick(box)
                setInfoOpenId((prev) => (prev === box.id ? null : box.id))
              }}
              className={cn(
                'pointer-events-auto absolute inset-0 rounded-sm bg-transparent',
                box.resolvedAt !== null && 'opacity-50',
                box.id === highlightedAnnotationId && 'ai-annotation-highlight'
              )}
              style={{ border: `1px solid ${box.color}`, boxShadow: `0 0 0 1px rgba(0,0,0,0.35)` }}
            >
              <Sparkles
                className="absolute -left-1 -top-1 h-2 w-2 rounded-full p-px"
                style={{ backgroundColor: box.color, color: 'white' }}
              />
            </button>
            {isInfoOpen && (
              <div
                className="pointer-events-auto absolute left-0 top-full z-10 mt-1 max-w-[16rem] rounded-md border border-border-strong bg-surface-raised px-2 py-1.5 text-xs text-text-primary shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                {box.commentText}
              </div>
            )}
          </div>
        )
      })}
```

(The `boxShadow` on the button is a 1px dark outline behind the colored border — that's the "high contrast" fix: a thin colored line alone can wash out against light schematic backgrounds, so a subtle dark hairline immediately outside it keeps the box readable on any drawing color underneath, without thickening the line itself.)

- [ ] **Step 4: Dismiss the popover on outside click**

Add an effect that clears `infoOpenId` when clicking anywhere else in the document:

```ts
  useEffect(() => {
    if (!infoOpenId) return
    const handleClickAway = (): void => setInfoOpenId(null)
    window.addEventListener('click', handleClickAway)
    return () => window.removeEventListener('click', handleClickAway)
  }, [infoOpenId])
```

(Placed after the existing canvas-drawing `useEffect`. The popover's own `onClick={(e) => e.stopPropagation()}` from Step 3 prevents this listener from immediately closing a popover the user just clicked into.)

- [ ] **Step 5: Type-check**

Run: `npm run typecheck`
Expected: FAIL — `PdfViewer.tsx` doesn't pass `showAiAnnotations` yet. Confirm the only failure is there; fixed in Task 3.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/pdf/AnnotationCanvas.tsx
git commit -m "feat: click-to-show AI annotation info, thinner high-contrast boxes, visibility toggle support"
```

---

### Task 3: Toolbar toggle button in `PdfViewer.tsx`

**Files:**
- Modify: `src/renderer/src/components/pdf/PdfViewer.tsx`

**Interfaces:**
- Consumes: `AnnotationCanvasProps.showAiAnnotations` (Task 2).

- [ ] **Step 1: Add the toggle state and icons**

Add `Eye`, `EyeOff`, `Sparkles` to the `lucide-react` import list (alphabetical, matching the file's existing style):

```ts
import {
  Circle,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Eye,
  EyeOff,
  Hand,
  Loader2,
  Maximize2,
  MessageCirclePlus,
  Pencil,
  Redo2,
  Sparkles,
  Square,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
```

Add state near the other tool-related `useState` calls (e.g. near `const [tool, setTool] = useState<Tool>('pan')`):

```ts
  const [showAiAnnotations, setShowAiAnnotations] = useState(true)
```

- [ ] **Step 2: Add the toolbar button**

In the zoom-controls group (the `<div className="flex items-center gap-1">` containing the zoom out/percentage/zoom in/fit buttons), add a new button before it:

```tsx
        <div className="flex items-center gap-1">
          <Button
            variant={showAiAnnotations ? 'accent' : 'ghost'}
            size="sm"
            onClick={() => setShowAiAnnotations((v) => !v)}
            title={showAiAnnotations ? 'Hide AI annotations' : 'Show AI annotations'}
          >
            {showAiAnnotations ? (
              <Sparkles className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => zoomBy(1 / ZOOM_STEP)} title="Zoom out">
```

(Keep the rest of that `<div>` — zoom out/percentage/zoom in/fit — unchanged; only the opening tag and this new button are added before the existing `Zoom out` button. `Eye` is imported for symmetry/potential future use but not required by this specific button since `Sparkles`/`EyeOff` already communicate the two states; remove the unused `Eye` import if lint flags it.)

- [ ] **Step 3: Pass the toggle to `AnnotationCanvas`**

Update the `<AnnotationCanvas .../>` render to add `showAiAnnotations={showAiAnnotations}`:

```tsx
          <AnnotationCanvas
            cssWidth={baseSize.width}
            cssHeight={baseSize.height}
            annotations={annotations}
            liveStroke={liveStroke}
            liveShape={liveShape}
            liveColor={color}
            liveStrokeWidth={strokeWidth}
            onMarkerClick={handleMarkerClick}
            highlightedAnnotationId={highlightedAnnotationId ?? null}
            showAiAnnotations={showAiAnnotations}
          />
```

- [ ] **Step 4: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the full automated suite**

Run: `npm run test:all`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/pdf/PdfViewer.tsx
git commit -m "feat: add toolbar toggle to show/hide AI annotations"
```

---

### Task 4: Manual verification

**Files:** none.

- [ ] **Step 1:** Restart `npm run dev` (renderer-only + one repo-layer change — a full restart is simplest and matches this session's established pattern for main-process changes; the repo change here is main-process).
- [ ] **Step 2:** Re-generate a quotation on an SLD with several AI flags on the same page. Confirm the boxes are visibly different colors from each other, not one solid blob.
- [ ] **Step 3:** Click a box. Confirm an info popover appears with the flag message, and it disappears on an outside click (no more relying on hover).
- [ ] **Step 4:** Click the new toolbar toggle. Confirm all AI boxes disappear, then reappear on toggling back.
- [ ] **Step 5:** Confirm the box border reads as a thin, high-contrast line against the schematic, and the corner badge no longer visually swallows nearby drawing detail.
- [ ] **Step 6:** `npm run test:all` and `npm run typecheck` once more to confirm nothing regressed.
