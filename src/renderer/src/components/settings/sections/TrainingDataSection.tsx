import { Download, Loader2 } from 'lucide-react'
import { Button } from '@renderer/components/common/Button'
import { useExportTrainingData } from '@renderer/state/queries/useExport'

export function TrainingDataSection(): React.JSX.Element {
  const exportTrainingData = useExportTrainingData()

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Training Data</h3>
      <p className="text-xs text-text-secondary">
        Exports every recorded AI-vs-human correction (from resolving flags and confidence
        prompts, across all projects) as a JSON Lines file — useful later for expanding
        extraction rules or training a local model. Each row includes the SLD, page, and the
        original AI value alongside what a human confirmed or corrected it to.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => exportTrainingData.mutate()}
        disabled={exportTrainingData.isPending}
      >
        {exportTrainingData.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        Export training data (.jsonl)
      </Button>
    </div>
  )
}
