import { FileStack } from 'lucide-react'

interface PdfViewerProps {
  filename: string
}

/** Stage 1 placeholder — real pdfjs-dist rendering + annotation overlay lands in Stage 3/4. */
export function PdfViewer({ filename }: PdfViewerProps): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface text-text-muted">
      <FileStack className="h-8 w-8" />
      <div className="text-sm">[ PDF diagram preview ]</div>
      <div className="font-mono text-xs">{filename}</div>
      <div className="text-xs">drop rendered file here</div>
    </div>
  )
}
