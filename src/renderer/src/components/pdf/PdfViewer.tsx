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

export function PdfViewer({ sldId, filename }: PdfViewerProps): React.JSX.Element {
  const { data: fileBytes, isLoading, isError } = useSldFile(sldId)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ start: Point; pan: Point } | null>(null)
  const strokeRef = useRef<AnnotationPoint[]>([])

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
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

  // Render the current page sized to fit the container, and re-center the view.
  const renderPage = useCallback((): (() => void) => {
    if (!pdfDoc || !containerRef.current || !canvasRef.current) return () => {}
    let cancelled = false
    let renderTask: RenderTask | null = null

    pdfDoc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled || !containerRef.current || !canvasRef.current) return
        const unscaled = page.getViewport({ scale: 1 })
        const availableWidth = containerRef.current.clientWidth - 32
        const availableHeight = containerRef.current.clientHeight - 32
        const fitScale = Math.min(
          availableWidth / unscaled.width,
          availableHeight / unscaled.height
        )
        const viewport = page.getViewport({ scale: Math.max(fitScale, 0.1) })

        const canvas = canvasRef.current
        const context = canvas.getContext('2d')
        if (!context) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        setViewportSize({ width: viewport.width, height: viewport.height })

        setZoom(1)
        setPan({
          x: (containerRef.current.clientWidth - viewport.width) / 2,
          y: (containerRef.current.clientHeight - viewport.height) / 2
        })

        renderTask = page.render({ canvasContext: context, viewport })
        return renderTask.promise
      })
      .catch((err: Error) => {
        if (!cancelled && err.name !== 'RenderingCancelledException') setRenderError(err.message)
      })

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [pdfDoc, pageNumber])

  useEffect(() => renderPage(), [renderPage])

  // Keep the fit sized to the panel as the app window / layout changes size.
  useEffect(() => {
    if (!containerRef.current) return
    let timeout: ReturnType<typeof setTimeout>
    const observer = new ResizeObserver(() => {
      clearTimeout(timeout)
      timeout = setTimeout(renderPage, 150)
    })
    observer.observe(containerRef.current)
    return () => {
      clearTimeout(timeout)
      observer.disconnect()
    }
  }, [renderPage])

  const screenToNormalized = (clientX: number, clientY: number): AnnotationPoint | null => {
    const container = containerRef.current
    if (!container || viewportSize.width === 0 || viewportSize.height === 0) return null
    const rect = container.getBoundingClientRect()
    const localX = (clientX - rect.left - pan.x) / zoom
    const localY = (clientY - rect.top - pan.y) / zoom
    return { x: localX / viewportSize.width, y: localY / viewportSize.height }
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
            onClick={renderPage}
            className="w-12 text-center font-mono text-xs text-text-secondary hover:text-text-primary"
            title="Fit to view"
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button variant="ghost" size="sm" onClick={() => zoomBy(ZOOM_STEP)} title="Zoom in">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={renderPage} title="Fit to view">
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
            width={viewportSize.width}
            height={viewportSize.height}
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
