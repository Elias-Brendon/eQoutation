import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Circle,
  ChevronLeft,
  ChevronRight,
  Eraser,
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
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { cn } from '@renderer/lib/cn'
import { Button } from '@renderer/components/common/Button'
import { ErrorMessage } from '@renderer/components/common/ErrorMessage'
import { AnnotationCanvas } from '@renderer/components/pdf/AnnotationCanvas'
import { TextEntryOverlay } from '@renderer/components/pdf/TextEntryOverlay'
import { useSldFile } from '@renderer/state/queries/useSldFile'
import {
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation
} from '@renderer/state/queries/useAnnotations'
import type { Annotation, AnnotationPoint } from '@shared/types/entities'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const MIN_ZOOM = 0.25
const MAX_ZOOM = 6
const ZOOM_STEP = 1.2
// Beyond this, further zoom is a pure CSS scale-up of the same bitmap (some
// softening is an acceptable tradeoff against unbounded canvas memory use).
const MAX_RENDER_QUALITY_ZOOM = 4
const MAX_DEVICE_PIXEL_RATIO = 2
const RENDER_DEBOUNCE_MS = 200

const ANNOTATION_COLORS = ['#ef4444', '#f2652c', '#eab308', '#6b8ee8']
const MIN_STROKE_WIDTH = 0.5
const MAX_STROKE_WIDTH = 10
const STROKE_WIDTH_STEP = 0.5
const DEFAULT_STROKE_WIDTH = 2.5

type Tool = 'pan' | 'pen' | 'pin' | 'circle' | 'rectangle' | 'text'
type ShapeTool = Extract<Tool, 'circle' | 'rectangle'>
type TextLikeTool = Extract<Tool, 'pin' | 'text'>

interface HistoryEntry {
  op: 'create' | 'delete'
  annotations: Annotation[]
}

interface PdfViewerProps {
  sldId: string
  filename: string
  focusPage?: number
  highlightedAnnotationId?: string | null
}

interface Point {
  x: number
  y: number
}

function devicePixelRatioCapped(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO)
}

export function PdfViewer({
  sldId,
  filename,
  focusPage,
  highlightedAnnotationId
}: PdfViewerProps): React.JSX.Element {
  const { data: fileBytes, isLoading, isError, error: fileError } = useSldFile(sldId)
  // Spans the toolbar + containerRef together — its own height comes from
  // ITS parent (fixed by flexbox), not from its children, so the resize
  // observer below can watch it to catch real window/pane resizes without
  // being tripped by the toolbar internally wrapping (which changes
  // containerRef's share of that fixed height, but not the total).
  const rootRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ start: Point; pan: Point } | null>(null)
  const strokeRef = useRef<AnnotationPoint[]>([])
  const shapeStartRef = useRef<AnnotationPoint | null>(null)
  const shapeCurrentRef = useRef<AnnotationPoint | null>(null)
  // Ephemeral, renderer-only undo/redo — reset whenever the page changes.
  // historyVersion exists purely to force a re-render after mutating these
  // refs (so Undo/Redo button disabled-state reflects the current stack).
  const historyRef = useRef<HistoryEntry[]>([])
  const redoRef = useRef<HistoryEntry[]>([])
  // Only one pdf.js render may target a canvas at a time — every render
  // path funnels through renderPageAtScale, which cancels this first.
  const renderTaskRef = useRef<RenderTask | null>(null)
  // Overlapping calls to renderPageAtScale/fitAndRender can resolve their
  // awaits out of order (e.g. rapid zoom clicks). Each call captures the
  // generation at start and bails after any await if a newer call has since
  // started, so a stale call can never clobber a newer one's result.
  const renderGenerationRef = useRef(0)

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  // Mirrors zoom/pan for synchronous reads in handleWheel/zoomBy. Needed
  // because nesting a setPan(...) dispatch inside setZoom(...)'s updater
  // function is impure — StrictMode double-invokes updaters in dev to catch
  // exactly that, and the nested dispatch firing twice compounds pan drift
  // on every tick (verified: what looked like the PDF "flying away" on zoom).
  // Reading fresh values from refs instead lets both setters be called
  // directly, with no nested dispatch to double-invoke.
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  useEffect(() => {
    zoomRef.current = zoom
    panRef.current = pan
  })
  // CSS-pixel size of the page at zoom=1 ("fit"). Stays fixed across zoom —
  // the wrapping layer's transform handles the visual scale. Only the
  // canvas's internal bitmap resolution changes with zoom, for sharpness.
  const [baseSize, setBaseSize] = useState({ width: 0, height: 0 })
  const [fitScale, setFitScale] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)

  const [tool, setTool] = useState<Tool>('pan')
  const [showAiAnnotations, setShowAiAnnotations] = useState(true)
  const [color, setColor] = useState(ANNOTATION_COLORS[0])
  const [strokeWidth, setStrokeWidth] = useState<number>(DEFAULT_STROKE_WIDTH)
  const [liveStroke, setLiveStroke] = useState<AnnotationPoint[] | null>(null)
  const [liveShape, setLiveShape] = useState<{
    shapeType: ShapeTool
    points: [AnnotationPoint, AnnotationPoint]
  } | null>(null)
  const [textEntry, setTextEntry] = useState<{
    point: AnnotationPoint
    shapeType: TextLikeTool
  } | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)

  const { data: annotations = [] } = useAnnotations(sldId, pageNumber)
  const createAnnotation = useCreateAnnotation()
  const deleteAnnotation = useDeleteAnnotation()

  // Undo/redo is scoped per page — switching pages starts fresh rather than
  // letting an undo on one page reach back into a different page's history.
  useEffect(() => {
    historyRef.current = []
    redoRef.current = []
    setHistoryVersion((v) => v + 1)
  }, [sldId, pageNumber])

  const pushHistory = (entry: HistoryEntry): void => {
    historyRef.current.push(entry)
    redoRef.current = []
    setHistoryVersion((v) => v + 1)
  }

  // Cross-reference jump from the quotation table (Stage 22). No-op when
  // undefined, so this stays backward compatible for callers that don't pass it.
  useEffect(() => {
    if (focusPage === undefined || !pdfDoc) return
    const clamped = Math.min(Math.max(focusPage, 1), pdfDoc.numPages)
    setPageNumber(clamped)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPage, pdfDoc])

  // Load the document whenever the file bytes change.
  useEffect(() => {
    if (!fileBytes) return
    let cancelled = false

    const loadingTask = pdfjsLib.getDocument({ data: fileBytes.slice() })
    loadingTask.promise
      .then((doc) => {
        if (cancelled) return
        setRenderError(null)
        setPdfDoc(doc)
        setPageNumber(1)
      })
      .catch((err: Error) => {
        if (!cancelled) setRenderError(err.message)
      })

    return () => {
      cancelled = true
      loadingTask.destroy()
    }
  }, [fileBytes])

  // Single funnel for actually drawing into the canvas. Cancels whatever
  // render was previously in flight so two calls can never race on the
  // same canvas (pdf.js throws if they do).
  const renderPageAtScale = useCallback(
    async (scale: number): Promise<void> => {
      if (!pdfDoc || !canvasRef.current) return
      const generation = ++renderGenerationRef.current
      const page = await pdfDoc.getPage(pageNumber)
      if (generation !== renderGenerationRef.current || !canvasRef.current) return

      // pdf.js releases a cancelled render's hold on the canvas asynchronously,
      // not the instant cancel() is called. Starting a new render before that
      // settles throws "Cannot use the same canvas during multiple render()
      // operations" — so wait for the cancellation to actually finish first.
      const previous = renderTaskRef.current
      if (previous) {
        previous.cancel()
        await previous.promise.catch(() => {})
      }
      if (generation !== renderGenerationRef.current || !canvasRef.current) return

      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      const context = canvas.getContext('2d')
      if (!context) return
      canvas.width = viewport.width
      canvas.height = viewport.height

      try {
        const task = page.render({ canvasContext: context, viewport })
        renderTaskRef.current = task
        await task.promise
        if (renderTaskRef.current === task) renderTaskRef.current = null
      } catch (err) {
        const error = err as Error
        if (error.name !== 'RenderingCancelledException') setRenderError(error.message)
      }
    },
    [pdfDoc, pageNumber]
  )

  // Fit the page to the container: sets the CSS display size and does an
  // initial high-DPI render. Resets zoom/pan. Used on page/document change
  // and on container resize (and via the explicit "fit to view" action).
  const fitAndRender = useCallback(async (): Promise<void> => {
    if (!pdfDoc || !containerRef.current || !canvasRef.current) return
    // The container can still be mid-layout (e.g. right after a split-view
    // pane resize) with a transitional near-zero size. Fitting against that
    // produces a bogus tiny scale that then gets violently corrected a
    // moment later by the resize observer — which looks like the PDF
    // "flying away" mid-zoom. Bail and let the resize observer retry once
    // the container has actually settled.
    if (containerRef.current.clientWidth < 40 || containerRef.current.clientHeight < 40) return
    const generation = ++renderGenerationRef.current
    const page = await pdfDoc.getPage(pageNumber)
    if (generation !== renderGenerationRef.current || !containerRef.current || !canvasRef.current)
      return

    const unscaled = page.getViewport({ scale: 1 })
    const availableWidth = containerRef.current.clientWidth - 32
    const availableHeight = containerRef.current.clientHeight - 32
    const newFitScale = Math.max(
      Math.min(availableWidth / unscaled.width, availableHeight / unscaled.height),
      0.1
    )
    const cssViewport = page.getViewport({ scale: newFitScale })

    const canvas = canvasRef.current
    canvas.style.width = `${cssViewport.width}px`
    canvas.style.height = `${cssViewport.height}px`

    const centeredPan = {
      x: (containerRef.current.clientWidth - cssViewport.width) / 2,
      y: (containerRef.current.clientHeight - cssViewport.height) / 2
    }
    zoomRef.current = 1
    panRef.current = centeredPan
    setFitScale(newFitScale)
    setBaseSize({ width: cssViewport.width, height: cssViewport.height })
    setZoom(1)
    setPan(centeredPan)

    await renderPageAtScale(newFitScale * devicePixelRatioCapped())
  }, [pdfDoc, pageNumber, renderPageAtScale])

  useEffect(() => {
    fitAndRender()
  }, [fitAndRender])

  // Keep the fit sized to the panel as the app window / layout changes size.
  // Observes rootRef (toolbar + containerRef together), not containerRef
  // itself: rootRef's height comes from ITS parent (fixed by flexbox), so
  // it only actually changes on a real window/pane resize — not when the
  // toolbar internally wraps to two lines (e.g. switching drawing tools
  // adds a stroke-width slider + color swatches), which changes
  // containerRef's share of that fixed height without changing the total.
  // Observing containerRef directly would treat that reflow as a real
  // resize and reset an in-progress zoom/pan back to "fit" — which is what
  // switching tools mid-zoom looked like the PDF "flying away".
  useEffect(() => {
    if (!rootRef.current) return
    let timeout: ReturnType<typeof setTimeout>
    const observer = new ResizeObserver(() => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        fitAndRender()
      }, 150)
    })
    observer.observe(rootRef.current)
    return () => {
      clearTimeout(timeout)
      observer.disconnect()
    }
  }, [fitAndRender])

  // Re-render the page bitmap at a resolution matching the current zoom, so
  // the content stays sharp instead of the browser stretching a low-res
  // bitmap. Debounced so rapid wheel/drag zooming doesn't thrash pdf.js.
  useEffect(() => {
    if (!pdfDoc || !fitScale) return
    const timeout = setTimeout(() => {
      const qualityZoom = Math.min(Math.max(zoom, 1), MAX_RENDER_QUALITY_ZOOM)
      renderPageAtScale(fitScale * qualityZoom * devicePixelRatioCapped())
    }, RENDER_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [pdfDoc, fitScale, zoom, renderPageAtScale])

  const screenToNormalized = (clientX: number, clientY: number): AnnotationPoint | null => {
    const container = containerRef.current
    if (!container || baseSize.width === 0 || baseSize.height === 0) return null
    const rect = container.getBoundingClientRect()
    const localX = (clientX - rect.left - pan.x) / zoom
    const localY = (clientY - rect.top - pan.y) / zoom
    return { x: localX / baseSize.width, y: localY / baseSize.height }
  }

  const handleWheel = useCallback((e: WheelEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const direction = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP

    const prevZoom = zoomRef.current
    const prevPan = panRef.current
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * direction))
    const newPan = {
      x: mouseX - ((mouseX - prevPan.x) / prevZoom) * newZoom,
      y: mouseY - ((mouseY - prevPan.y) / prevZoom) * newZoom
    }
    zoomRef.current = newZoom
    panRef.current = newPan
    setZoom(newZoom)
    setPan(newPan)
  }, [])

  // Attached natively with { passive: false } rather than via React's
  // onWheel prop: React (and browsers generally) may treat wheel listeners
  // as passive by default in some configurations, which silently makes
  // preventDefault() a no-op — the browser's native scroll/zoom then fights
  // with this custom pan/zoom, which is what "the PDF drifts out of frame
  // while scrolling" looks like from the outside.
  //
  // fitScale is in the dependency array as a mount-timing safeguard: on a
  // real cold load, this component first renders its loading-spinner return
  // (see isLoading below) before the container div — and therefore
  // containerRef.current — exists. handleWheel alone never changes, so an
  // effect depending only on it would attach against a still-null ref once
  // and never retry. fitScale flips from 0 to non-zero only after
  // fitAndRender runs, which is only reachable once the container is
  // guaranteed to exist, so it reliably triggers the retry.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [handleWheel, fitScale])

  const zoomBy = (direction: number): void => {
    const prevZoom = zoomRef.current
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * direction))
    zoomRef.current = newZoom
    setZoom(newZoom)

    if (containerRef.current) {
      const centerX = containerRef.current.clientWidth / 2
      const centerY = containerRef.current.clientHeight / 2
      const prevPan = panRef.current
      const newPan = {
        x: centerX - ((centerX - prevPan.x) / prevZoom) * newZoom,
        y: centerY - ((centerY - prevPan.y) / prevZoom) * newZoom
      }
      panRef.current = newPan
      setPan(newPan)
    }
  }

  const handleMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault()

    if (tool === 'pan') {
      dragRef.current = { start: { x: e.clientX, y: e.clientY }, pan }
      setIsDragging(true)
      return
    }

    const point = screenToNormalized(e.clientX, e.clientY)
    if (!point) return

    if (tool === 'pin' || tool === 'text') {
      setTextEntry({ point, shapeType: tool })
      return
    }

    if (tool === 'circle' || tool === 'rectangle') {
      shapeStartRef.current = point
      shapeCurrentRef.current = point
      setLiveShape({ shapeType: tool, points: [point, point] })
      return
    }

    // tool === 'pen'
    strokeRef.current = [point]
    setLiveStroke([point])
  }

  const handleTextEntryConfirm = (text: string): void => {
    if (!textEntry) return
    createAnnotation.mutate(
      {
        sldId,
        pageNumber,
        shapeType: textEntry.shapeType,
        points: [textEntry.point],
        color,
        commentText: text
      },
      { onSuccess: (created) => pushHistory({ op: 'create', annotations: [created] }) }
    )
    setTextEntry(null)
  }

  const handleTextEntryCancel = (): void => {
    setTextEntry(null)
  }

  // Pan dragging: track globally so it keeps working outside the container bounds.
  useEffect(() => {
    if (!isDragging) return

    const handleMove = (e: MouseEvent): void => {
      if (!dragRef.current) return
      const { start, pan: panStart } = dragRef.current
      setPan({ x: panStart.x + (e.clientX - start.x), y: panStart.y + (e.clientY - start.y) })
    }
    const handleUp = (): void => {
      dragRef.current = null
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isDragging])

  // Freehand drawing: track globally so a fast stroke isn't cut off by leaving the container.
  useEffect(() => {
    if (tool !== 'pen' || !liveStroke) return

    const handleMove = (e: MouseEvent): void => {
      const point = screenToNormalized(e.clientX, e.clientY)
      if (!point) return
      strokeRef.current = [...strokeRef.current, point]
      setLiveStroke(strokeRef.current)
    }
    const handleUp = (): void => {
      if (strokeRef.current.length > 1) {
        createAnnotation.mutate(
          {
            sldId,
            pageNumber,
            shapeType: 'freehand',
            points: strokeRef.current,
            color,
            strokeWidth
          },
          { onSuccess: (created) => pushHistory({ op: 'create', annotations: [created] }) }
        )
      }
      strokeRef.current = []
      setLiveStroke(null)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, liveStroke === null])

  // Circle/rectangle drag-to-draw: mirrors the freehand effect above (global
  // listeners so a fast drag isn't cut off by leaving the container), using
  // refs for the authoritative start/end points since handleUp is defined
  // once per drag and would otherwise close over a stale liveShape state.
  useEffect(() => {
    if ((tool !== 'circle' && tool !== 'rectangle') || !liveShape) return

    const handleMove = (e: MouseEvent): void => {
      const point = screenToNormalized(e.clientX, e.clientY)
      if (!point || !shapeStartRef.current) return
      shapeCurrentRef.current = point
      setLiveShape({ shapeType: tool, points: [shapeStartRef.current, point] })
    }
    const handleUp = (): void => {
      const start = shapeStartRef.current
      const end = shapeCurrentRef.current
      if (start && end && (Math.abs(end.x - start.x) > 0.002 || Math.abs(end.y - start.y) > 0.002)) {
        createAnnotation.mutate(
          {
            sldId,
            pageNumber,
            shapeType: tool,
            points: [start, end],
            color,
            strokeWidth
          },
          { onSuccess: (created) => pushHistory({ op: 'create', annotations: [created] }) }
        )
      }
      shapeStartRef.current = null
      shapeCurrentRef.current = null
      setLiveShape(null)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, liveShape === null])

  const handleMarkerClick = (annotation: Annotation): void => {
    // AI-authored pins are a permanent record (see design spec) — no delete,
    // no confirm dialog. The hover title already shows the flag message.
    if (annotation.authorType === 'ai') return
    const label = annotation.commentText ?? 'this annotation'
    const shouldDelete = window.confirm(`${label}\n\nDelete this comment?`)
    if (!shouldDelete) return
    deleteAnnotation.mutate({ id: annotation.id, sldId, pageNumber })
    pushHistory({ op: 'delete', annotations: [annotation] })
  }

  // Re-creates a batch of annotations (used by undo-a-delete and
  // redo-a-create) and invokes onDone with the newly-created rows — with
  // fresh ids, since recreated annotations don't need to reuse old ones —
  // once every recreation in the batch has resolved.
  const recreateAnnotations = (source: Annotation[], onDone: (created: Annotation[]) => void): void => {
    const created: Annotation[] = []
    for (const annotation of source) {
      createAnnotation.mutate(
        {
          sldId,
          pageNumber,
          shapeType: annotation.shapeType,
          points: annotation.points,
          color: annotation.color,
          strokeWidth: annotation.strokeWidth,
          commentText: annotation.commentText ?? undefined
        },
        {
          onSuccess: (newAnnotation) => {
            created.push(newAnnotation)
            if (created.length === source.length) onDone(created)
          }
        }
      )
    }
  }

  const handleUndo = (): void => {
    const entry = historyRef.current.pop()
    if (!entry) return
    setHistoryVersion((v) => v + 1)

    if (entry.op === 'create') {
      for (const annotation of entry.annotations) {
        deleteAnnotation.mutate({ id: annotation.id, sldId, pageNumber })
      }
      redoRef.current.push({ op: 'create', annotations: entry.annotations })
    } else {
      recreateAnnotations(entry.annotations, (created) => {
        redoRef.current.push({ op: 'delete', annotations: created })
      })
    }
  }

  const handleRedo = (): void => {
    const entry = redoRef.current.pop()
    if (!entry) return
    setHistoryVersion((v) => v + 1)

    if (entry.op === 'create') {
      recreateAnnotations(entry.annotations, (created) => {
        historyRef.current.push({ op: 'create', annotations: created })
      })
    } else {
      for (const annotation of entry.annotations) {
        deleteAnnotation.mutate({ id: annotation.id, sldId, pageNumber })
      }
      historyRef.current.push({ op: 'delete', annotations: entry.annotations })
    }
  }

  const handleClearPage = (): void => {
    if (annotations.length === 0) return
    if (!window.confirm(`Clear all ${annotations.length} annotation(s) on this page?`)) return
    pushHistory({ op: 'delete', annotations: [...annotations] })
    for (const annotation of annotations) {
      deleteAnnotation.mutate({ id: annotation.id, sldId, pageNumber })
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface text-text-muted">
        <Loader2 className="h-6 w-6 animate-spin" />
        <div className="text-sm">Loading {filename}…</div>
      </div>
    )
  }

  if (isError || renderError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-danger/40 bg-surface text-danger">
        <div className="text-sm">Could not render {filename}</div>
        {isError && (
          <div className="text-xs text-text-muted">
            <ErrorMessage message={fileError.message} />
          </div>
        )}
        {renderError && <div className="text-xs text-text-muted">{renderError}</div>}
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden rounded-lg border border-border bg-surface"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-y-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="font-mono text-xs text-text-secondary">
            Page {pageNumber} / {pdfDoc?.numPages ?? '—'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPageNumber((p) => Math.min(pdfDoc?.numPages ?? p, p + 1))}
            disabled={!pdfDoc || pageNumber >= pdfDoc.numPages}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant={tool === 'pan' ? 'accent' : 'ghost'}
            size="sm"
            onClick={() => setTool('pan')}
            title="Pan"
          >
            <Hand className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={tool === 'pen' ? 'accent' : 'ghost'}
            size="sm"
            onClick={() => setTool('pen')}
            title="Draw"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={tool === 'pin' ? 'accent' : 'ghost'}
            size="sm"
            onClick={() => setTool('pin')}
            title="Add comment pin"
          >
            <MessageCirclePlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={tool === 'text' ? 'accent' : 'ghost'}
            size="sm"
            onClick={() => setTool('text')}
            title="Add text"
          >
            <Type className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={tool === 'circle' ? 'accent' : 'ghost'}
            size="sm"
            onClick={() => setTool('circle')}
            title="Draw circle"
          >
            <Circle className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={tool === 'rectangle' ? 'accent' : 'ghost'}
            size="sm"
            onClick={() => setTool('rectangle')}
            title="Draw rectangle"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
          <div className="mx-1 flex items-center gap-1.5" title="Brush / stroke size">
            <input
              type="range"
              min={MIN_STROKE_WIDTH}
              max={MAX_STROKE_WIDTH}
              step={STROKE_WIDTH_STEP}
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              className="w-16 accent-accent"
            />
            <span className="w-9 shrink-0 font-mono text-[10px] text-text-secondary">
              {strokeWidth.toFixed(1)}px
            </span>
          </div>
          <div className="mx-1 flex items-center gap-1">
            {ANNOTATION_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  'h-4 w-4 rounded-full border-2 transition-transform',
                  color === c ? 'scale-110 border-white' : 'border-transparent'
                )}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUndo}
            disabled={historyRef.current.length === 0}
            title="Undo"
            data-history-version={historyVersion}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRedo}
            disabled={redoRef.current.length === 0}
            title="Redo"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearPage}
            disabled={annotations.length === 0}
            title="Clear annotations on this page"
          >
            <Eraser className="h-3.5 w-3.5" />
          </Button>
        </div>

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
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <button
            onClick={() => fitAndRender()}
            className="w-12 text-center font-mono text-xs text-text-secondary hover:text-text-primary"
            title="Fit to view"
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button variant="ghost" size="sm" onClick={() => zoomBy(ZOOM_STEP)} title="Zoom in">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fitAndRender()} title="Fit to view">
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        className={cn(
          'relative min-h-0 flex-1 select-none overflow-hidden',
          tool === 'pan' && (isDragging ? 'cursor-grabbing' : 'cursor-grab'),
          tool !== 'pan' && 'cursor-crosshair'
        )}
        onMouseDown={handleMouseDown}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            width: baseSize.width,
            height: baseSize.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0'
          }}
        >
          <canvas ref={canvasRef} draggable={false} className="absolute left-0 top-0 shadow-lg" />
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
          {textEntry && (
            <TextEntryOverlay
              leftPct={textEntry.point.x}
              topPct={textEntry.point.y}
              color={color}
              onConfirm={handleTextEntryConfirm}
              onCancel={handleTextEntryCancel}
            />
          )}
        </div>
      </div>
    </div>
  )
}
