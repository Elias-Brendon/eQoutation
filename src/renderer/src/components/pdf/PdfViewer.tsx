import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Button } from '@renderer/components/common/Button'
import { useSldFile } from '@renderer/state/queries/useSldFile'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

interface PdfViewerProps {
  sldId: string
  filename: string
}

export function PdfViewer({ sldId, filename }: PdfViewerProps): React.JSX.Element {
  const { data: fileBytes, isLoading, isError } = useSldFile(sldId)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.1)
  const [renderError, setRenderError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    let cancelled = false
    let renderTask: RenderTask | null = null

    pdfDoc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled || !canvasRef.current) return
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        const context = canvas.getContext('2d')
        if (!context) return
        canvas.width = viewport.width
        canvas.height = viewport.height
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
  }, [pdfDoc, pageNumber, scale])

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
    <div className="flex flex-1 flex-col gap-2 overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
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
          <Button variant="ghost" size="sm" onClick={() => setScale((s) => Math.max(0.4, s - 0.2))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="w-10 text-center font-mono text-xs text-text-secondary">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="ghost" size="sm" onClick={() => setScale((s) => Math.min(3, s + 0.2))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto p-4">
        <canvas ref={canvasRef} className="shadow-lg" />
      </div>
    </div>
  )
}
