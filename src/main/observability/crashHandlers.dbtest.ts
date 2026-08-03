import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { closeDb } from '../db/index'
import { listEvents } from '../db/repositories/eventLogRepo'
import {
  handleUncaughtException,
  handleUnhandledRejection,
  handleRenderProcessGone,
  handleUnresponsive
} from './crashHandlers'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

describe('crash handlers', () => {
  it('logs an uncaught exception', () => {
    handleUncaughtException(new Error('main process boom'))

    const [event] = listEvents()
    expect(event.level).toBe('crash')
    expect(event.source).toBe('main:uncaughtException')
    expect(event.message).toBe('main process boom')
  })

  it('logs an unhandled rejection', () => {
    handleUnhandledRejection('rejected for no reason')

    const [event] = listEvents()
    expect(event.level).toBe('crash')
    expect(event.source).toBe('main:unhandledRejection')
    expect(event.message).toBe('rejected for no reason')
  })

  it('logs a renderer process gone event', () => {
    handleRenderProcessGone({ reason: 'crashed', exitCode: 1 } as Electron.RenderProcessGoneDetails)

    const [event] = listEvents()
    expect(event.level).toBe('crash')
    expect(event.source).toBe('renderer:render-process-gone')
    expect(event.message).toBe('crashed')
  })

  it('logs a renderer unresponsive event', () => {
    handleUnresponsive()

    const [event] = listEvents()
    expect(event.level).toBe('crash')
    expect(event.source).toBe('renderer:unresponsive')
  })
})
