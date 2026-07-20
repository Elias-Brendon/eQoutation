import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Hand,
  Loader2,
  Maximize2,
  MessageCirclePlus,
  Pencil,
  Undo2,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { cn } from '@renderer/lib/cn'
import { Button } from '@renderer/components/common/Button'
import { AnnotationCanvas } from '@renderer/components/pdf/AnnotationCanvas'
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

type Tool = 'pan' | 'pen' | 'pin'

interface PdfViewerProps {
  sldId: string
  filename: string
}

interface Point {
  x: number
  y: number
}

function devicePixelRatioCapped(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO)
}

export function PdfViewer({ sldId, filename }: PdfViewerProps): React.JSX.Element {
  const { data: fileBytes, isLoading, isError } = useSldFile(sldId)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ start: Point; pan: Point } | null>(null)
  const strokeRef = useRef<AnnotationPoint[]>([])
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
  // CSS-pixel size of the page at zoom=1 ("fit"). Stays fixed across zoom —
  // the wrapping layer's transform handles the visual scale. Only the
  // canvas's internal bitmap resolution changes with zoom, for sharpness.
  const [baseSize, setBaseSize] = useState({ width: 0, height: 0 })
  const [fitScale, setFitScale] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)

  const [tool, setTool] = useState<Tool>('pan')
  const [color, setColor] = useState(ANNOTATION_COLORS[0])
  const [liveStroke, setLiveStroke] = useState<AnnotationPoint[] | null>(null)

  const { data: annotations = [] } = useAnnotations(sldId, pageNumber)
  const createAnnotation = useCreateAnnotation()
  const deleteAnnotation = useDeleteAnnotation()

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

    setFitScale(newFitScale)
    setBaseSize({ width: cssViewport.width, height: cssViewport.height })
    setZoom(1)
    setPan({
      x: (containerRef.current.clientWidth - cssViewport.width) / 2,
      y: (containerRef.current.clientHeight - cssViewport.height) / 2
    })

    await renderPageAtScale(newFitScale * devicePixelRatioCapped())
  }, [pdfDoc, pageNumber, renderPageAtScale])

  useEffect(() => {
    fitAndRender()
  }, [fitAndRender])

  // Keep the fit sized to the panel as the app window / layout changes size.
  useEffect(() => {
    if (!containerRef.current) return
    let timeout: ReturnType<typeof setTimeout>
    const observer = new ResizeObserver(() => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        fitAndRender()
      }, 150)
    })
    observer.observe(containerRef.current)
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

  const handleWheel = (e: React.WheelEvent): void => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const direction = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP

    setZoom((prevZoom) => {
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * direction))
      setPan((prevPan) => ({
        x: mouseX - ((mouseX - prevPan.x) / prevZoom) * newZoom,
        y: mouseY - ((mouseY - prevPan.y) / prevZoom) * newZoom
      }))
      return newZoom
    })
  }

  const zoomBy = (direction: number): void => {
    setZoom((prevZoom) => {
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * direction))
      if (containerRef.current) {
        const centerX = containerRef.current.clientWidth / 2
        const centerY = containerRef.current.clientHeight / 2
        setPan((prevPan) => ({
          x: centerX - ((centerX - prevPan.x) / prevZoom) * newZoom,
          y: centerY - ((centerY - prevPan.y) / prevZoom) * newZoom
        }))
      }
      return newZoom
    })
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

    if (tool === 'pin') {
      const commentText = window.prompt('Comment for this pin:')
      if (!commentText || !commentText.trim()) return
      createAnnotation.mutate({
        sldId,
        pageNumber,
        shapeType: 'pin',
        points: [point],
        color,
        commentText: commentText.trim()
      })
      return
    }

    // tool === 'pen'
    strokeRef.current = [point]
    setLiveStroke([point])
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
        createAnnotation.mutate({
          sldId,
          pageNumber,
          shapeType: 'freehand',
          points: strokeRef.current,
          color
        })
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

  const handlePinClick = (annotation: Annotation): void => {
    const shouldDelete = window.confirm(`${annotation.commentText}\n\nDelete this comment?`)
    if (shouldDelete) {
      deleteAnnotation.mutate({ id: annotation.id, sldId, pageNumber })
    }
  }

  const handleUndo = (): void => {
    const last = annotations[annotations.length - 1]
    if (last) deleteAnnotation.mutate({ id: last.id, sldId, pageNumber })
  }

  const handleClearPage = (): void => {
    if (annotations.length === 0) return
    if (!window.confirm(`Clear all ${annotations.length} annotation(s) on this page?`)) return
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
        {renderError && <div className="text-xs text-text-muted">{renderError}</div>}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-lg border border-border bg-surface">
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
            disabled={annotations.length === 0}
            title="Undo last annotation"
          >
            <Undo2 className="h-3.5 w-3.5" />
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
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        <div
          className="absolute left-0 top-0"
          style={{
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
            liveColor={color}
            onPinClick={handlePinClick}
          />
        </div>
      </div>
    </div>
  )
}
