import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { closeDb } from '../db/index'
import { logEvent } from '../db/repositories/eventLogRepo'
import { buildDiagnosticBundle } from './diagnosticBundleExporter'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

describe('buildDiagnosticBundle', () => {
  it('includes system info and logged events', () => {
    logEvent({ level: 'error', source: 'ipc:test', message: 'boom' })
    logEvent({ level: 'crash', source: 'main:uncaughtException', message: 'crashed' })

    const bundle = buildDiagnosticBundle()

    expect(bundle.systemInfo.appVersion).toEqual(expect.any(String))
    expect(bundle.systemInfo.osPlatform).toEqual(expect.any(String))
    expect(bundle.systemInfo.arch).toEqual(expect.any(String))
    expect(bundle.events).toHaveLength(2)
    expect(bundle.events.map((e) => e.source)).toEqual(
      expect.arrayContaining(['ipc:test', 'main:uncaughtException'])
    )
  })

  it('returns an empty events array when nothing has been logged', () => {
    const bundle = buildDiagnosticBundle()
    expect(bundle.events).toEqual([])
  })
})
