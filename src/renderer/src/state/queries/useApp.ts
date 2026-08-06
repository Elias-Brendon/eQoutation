import { useEffect, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { UpdateCheckResult, UpdateStatus } from '@shared/types/entities'

export const updateStatusQueryKey = ['app', 'updateStatus'] as const

export function useAppVersion(): UseQueryResult<string> {
  return useQuery({
    queryKey: ['app', 'version'],
    queryFn: () => window.api.app.getVersion(),
    staleTime: Infinity
  })
}

export function useUpdateCheck(): UseQueryResult<UpdateStatus | null> {
  return useQuery({
    queryKey: updateStatusQueryKey,
    queryFn: () => window.api.app.getUpdateStatus(),
    staleTime: Infinity
  })
}

// Triggers a fresh update check (distinct from useUpdateCheck's read of the
// once-per-launch cached result). Writes straight into updateStatusQueryKey
// via setQueryData rather than invalidateQueries — the mutation's own fetch
// already refreshed the main-process cache, so a refetch here would just
// re-read the same value with an extra IPC round trip. This is also what
// makes the TopBar's update pill (which reads the same query key) reflect a
// manual check with no extra wiring.
export function useCheckForUpdate(): UseMutationResult<UpdateCheckResult, Error, void> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.app.checkForUpdate(),
    onSuccess: (result) => {
      queryClient.setQueryData(updateStatusQueryKey, result.status)
    }
  })
}

export function useDownloadUpdate(): UseMutationResult<void, Error, void> {
  return useMutation({
    mutationFn: () => window.api.app.downloadUpdate()
  })
}

// Percent (0-100) of the update currently downloading, or null before a
// download starts. ipcRenderer.on supports multiple independent listeners
// on one channel, so both TopBar and Settings can call this directly
// without needing shared global state the way extractionProgress does in
// useUiStore (that one is needed in many places at once; this is needed in
// exactly two).
export function useUpdateDownloadProgress(): number | null {
  const [percent, setPercent] = useState<number | null>(null)
  useEffect(() => window.api.app.onUpdateDownloadProgress(setPercent), [])
  return percent
}

// Shared confirm -> download -> progress flow for both UI surfaces
// (TopBar's pill and Settings' About section) that offer "install this
// update now". A single confirmation covers the whole action — once the
// download finishes, the main process installs and relaunches on its own
// (see updater/autoUpdater.ts's update-downloaded handler); there is
// nothing further for the renderer to do after starting the download.
export function useUpdateInstall(): {
  isDownloading: boolean
  didFail: boolean
  percent: number | null
  startUpdate: (latestVersion: string) => void
} {
  const download = useDownloadUpdate()
  const percent = useUpdateDownloadProgress()

  const startUpdate = (latestVersion: string): void => {
    const confirmed = window.confirm(
      `Update to v${latestVersion}? The app will download the update and restart automatically.`
    )
    if (!confirmed) return
    download.mutate()
  }

  return {
    isDownloading: download.isPending,
    didFail: download.isError,
    percent,
    startUpdate
  }
}
