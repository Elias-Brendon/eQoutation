import { AlertTriangle, Download, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@renderer/components/common/Button'
import {
  useAppVersion,
  useCheckForUpdate,
  useUpdateCheck,
  useUpdateInstall
} from '@renderer/state/queries/useApp'

export function AboutSection(): React.JSX.Element {
  const { data: version } = useAppVersion()
  const { data: status } = useUpdateCheck()
  const checkForUpdate = useCheckForUpdate()
  const { isDownloading, didFail, percent, startUpdate } = useUpdateInstall()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">About</h3>
        <p className="mt-1 text-xs text-text-secondary">
          eQuotation{version ? ` v${version}` : ''}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkForUpdate.mutate()}
            disabled={checkForUpdate.isPending || isDownloading}
            className="w-fit"
          >
            {checkForUpdate.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Check for Updates
          </Button>
          {status?.isNewer && !isDownloading && (
            <Button
              variant="accent"
              size="sm"
              onClick={() => startUpdate(status.latestVersion)}
              className="w-fit"
            >
              <Download className="h-3.5 w-3.5" />
              Update Now
            </Button>
          )}
        </div>
        <UpdateStatusLine
          isPending={checkForUpdate.isPending}
          lastCheckSucceeded={checkForUpdate.data?.succeeded}
          status={status ?? null}
          isDownloading={isDownloading}
          didFail={didFail}
          percent={percent}
        />
      </div>

      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <p className="font-semibold">Beta software</p>
          <p className="mt-0.5">
            This is a beta release expect bugs. Use for evaluation, not production-critical work
            without a backup.
          </p>
        </div>
      </div>

      <div>
        <h4 className="mb-1.5 text-xs font-semibold text-text-primary">Data handling</h4>
        <ul className="flex flex-col gap-1 text-xs text-text-secondary">
          <li>
            • SLD PDFs you upload are sent to Anthropic&apos;s Claude API for component extraction.
          </li>
          <li>• Currency conversion queries Frankfurter&apos;s public API.</li>
          <li>• All project data is stored locally on this machine.</li>
          <li>• No data is sent to the developer or any other third party.</li>
        </ul>
      </div>

      <p className="text-xs text-text-muted">© 2026 Elias Brendon. All rights reserved.</p>
    </div>
  )
}

interface UpdateStatusLineProps {
  isPending: boolean
  // undefined until a manual check has run at least once this session —
  // distinguishes "never manually checked" from "manually checked and failed".
  lastCheckSucceeded: boolean | undefined
  status: { latestVersion: string; isNewer: boolean } | null
  isDownloading: boolean
  didFail: boolean
  percent: number | null
}

// Priority order: an in-progress or just-failed download outranks the
// check-pending/check-failed states, which outrank a stale "available" or
// "up to date" line — always show the most current thing that's true.
function UpdateStatusLine({
  isPending,
  lastCheckSucceeded,
  status,
  isDownloading,
  didFail,
  percent
}: UpdateStatusLineProps): React.JSX.Element {
  if (isDownloading) {
    return <p className="text-xs text-accent">Downloading update… {percent ?? 0}%</p>
  }

  if (didFail) {
    return <p className="text-xs text-danger">Update failed to download, try again.</p>
  }

  if (isPending) {
    return <p className="text-xs text-text-muted">Checking for updates…</p>
  }

  if (lastCheckSucceeded === false) {
    return (
      <p className="text-xs text-danger">
        Couldn&apos;t check for updates, check your connection and try again.
      </p>
    )
  }

  if (status?.isNewer) {
    return (
      <p className="flex items-center gap-1 text-xs text-accent">
        <Download className="h-3 w-3" />
        Update available: v{status.latestVersion}
      </p>
    )
  }

  if (status) {
    return <p className="text-xs text-text-muted">You&apos;re up to date.</p>
  }

  return <p className="text-xs text-text-muted">Not checked yet.</p>
}
