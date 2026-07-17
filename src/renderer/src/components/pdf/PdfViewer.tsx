import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { cn } from '@renderer/lib/cn'
import { Button } from '@renderer/components/common/Button'
import { useSldFile } from '@renderer/state/queries/useSldFile'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const MIN_ZOOM = 0.25
const MAX_ZOOM = 6
const ZOOM_STEP = 1.2

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

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)

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
    dragRef.current = { start: { x: e.clientX, y: e.clientY }, pan }
    setIsDragging(true)
  }

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
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
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
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        <canvas
          ref={canvasRef}
          draggable={false}
          className="absolute left-0 top-0 shadow-lg"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0'
          }}
        />
      </div>
    </div>
  )
}
