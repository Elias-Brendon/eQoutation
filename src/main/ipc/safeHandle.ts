import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { AppError } from '../errors/AppError'
import { logEvent } from '../db/repositories/eventLogRepo'

type Handler<Args extends unknown[], R> = (
  event: IpcMainInvokeEvent,
  ...args: Args
) => R | Promise<R>

// Drop-in replacement for ipcMain.handle: any error a handler throws that
// isn't already an AppError (a raw db/fs/network exception, a library error,
// a bug) is logged here in full for debugging, then replaced with a generic
// sanitized AppError before it crosses the IPC boundary — so internal detail
// never reaches the renderer, even for failures nobody wrote an explicit
// AppError for. Handlers that already throw AppError pass through unchanged.
export function safeHandle<Args extends unknown[], R>(
  channel: string,
  handler: Handler<Args, R>
): void {
  ipcMain.handle(channel, async (event, ...args: Args): Promise<R> => {
    try {
      return await handler(event, ...args)
    } catch (error) {
      if (error instanceof AppError) throw error
      console.error(`[ipc:${channel}]`, error)
      logEvent({
        level: 'error',
        source: `ipc:${channel}`,
        message: error instanceof Error ? error.message : String(error),
        context: error instanceof Error ? { stack: error.stack } : undefined
      })
      throw new AppError('GEN_UNEXPECTED')
    }
  })
}
