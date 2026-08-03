import type { WebContents, RenderProcessGoneDetails } from 'electron'
import { logEvent } from '../db/repositories/eventLogRepo'

export function handleUncaughtException(error: Error): void {
  logEvent({
    level: 'crash',
    source: 'main:uncaughtException',
    message: error.message,
    context: { stack: error.stack }
  })
}

export function handleUnhandledRejection(reason: unknown): void {
  logEvent({
    level: 'crash',
    source: 'main:unhandledRejection',
    message: String(reason),
    context: { reason }
  })
}

export function handleRenderProcessGone(details: RenderProcessGoneDetails): void {
  logEvent({
    level: 'crash',
    source: 'renderer:render-process-gone',
    message: details.reason,
    context: details
  })
}

export function handleUnresponsive(): void {
  logEvent({
    level: 'crash',
    source: 'renderer:unresponsive',
    message: 'Renderer became unresponsive'
  })
}

// Called once from main/index.ts inside app.whenReady().then(...).
export function registerCrashHandlers(): void {
  process.on('uncaughtException', handleUncaughtException)
  process.on('unhandledRejection', handleUnhandledRejection)
}

// Called from createWindow() once the BrowserWindow's webContents exists.
export function registerWindowCrashHandlers(webContents: WebContents): void {
  webContents.on('render-process-gone', (_event, details) => handleRenderProcessGone(details))
  webContents.on('unresponsive', handleUnresponsive)
}
