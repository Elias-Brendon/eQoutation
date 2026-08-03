import { Download, Loader2 } from 'lucide-react'
import { Button } from '@renderer/components/common/Button'
import { useExportDiagnosticBundle } from '@renderer/state/queries/useExport'

export function DiagnosticsSection(): React.JSX.Element {
  const exportDiagnosticBundle = useExportDiagnosticBundle()

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Diagnostics</h3>
      <p className="text-xs text-text-secondary">
        Exports a local diagnostic bundle — recent app errors and crashes, plus basic system info
        (app version, OS, memory) — as a JSON file. Nothing is sent anywhere automatically; if you
        want to share this with the developer to help debug an issue, you choose to send the file
        yourself.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => exportDiagnosticBundle.mutate()}
        disabled={exportDiagnosticBundle.isPending}
      >
        {exportDiagnosticBundle.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        Export diagnostic bundle (.json)
      </Button>
    </div>
  )
}
