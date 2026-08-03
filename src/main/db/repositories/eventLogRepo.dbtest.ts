import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../index'
import { logEvent, listEvents } from './eventLogRepo'

beforeEach(() => {
  closeDb()
})

afterEach(() => {
  closeDb()
})

describe('logEvent / listEvents', () => {
  it('persists an error-level event and reads it back', () => {
    logEvent({ level: 'error', source: 'ipc:test:channel', message: 'boom' })

    const events = listEvents()
    expect(events).toHaveLength(1)
    expect(events[0].level).toBe('error')
    expect(events[0].source).toBe('ipc:test:channel')
    expect(events[0].message).toBe('boom')
    expect(events[0].errorCode).toBeNull()
    expect(events[0].context).toBeNull()
  })

  it('serializes context to a JSON string', () => {
    logEvent({
      level: 'crash',
      source: 'main:uncaughtException',
      message: 'crashed',
      context: { stack: 'at foo()' }
    })

    const [event] = listEvents()
    expect(event.context).toBe(JSON.stringify({ stack: 'at foo()' }))
  })

  it('orders by most recent first and respects the limit', () => {
    getDb()
      .prepare(
        `INSERT INTO event_log (id, level, source, message, error_code, context, created_at)
         VALUES ('e1', 'error', 'src1', 'first', NULL, NULL, '2026-01-01T00:00:00.000Z'),
                ('e2', 'error', 'src2', 'second', NULL, NULL, '2026-01-02T00:00:00.000Z'),
                ('e3', 'error', 'src3', 'third', NULL, NULL, '2026-01-03T00:00:00.000Z')`
      )
      .run()

    const events = listEvents(2)
    expect(events).toHaveLength(2)
    expect(events.map((e) => e.id)).toEqual(['e3', 'e2'])
  })
})
