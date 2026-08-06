import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdate, getUpdateStatus, isNewerVersion } from './updateCheck'

describe('isNewerVersion', () => {
  it('returns true when the latest major version is higher', () => {
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true)
  })

  it('returns true when the latest minor version is higher', () => {
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true)
  })

  it('returns true when the latest patch version is higher', () => {
    expect(isNewerVersion('0.1.2', '0.1.1')).toBe(true)
  })

  it('returns false when versions are equal', () => {
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
  })

  it('returns false when the latest version is older than current', () => {
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false)
  })
})

describe('checkForUpdate', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns true and updates the cached status when the fetch succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ latestVersion: '9.9.9' })
      })
    )

    const succeeded = await checkForUpdate('0.1.0')

    expect(succeeded).toBe(true)
    expect(getUpdateStatus()).toEqual({
      currentVersion: '0.1.0',
      latestVersion: '9.9.9',
      isNewer: true
    })
  })

  it('returns false when the fetch fails, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const succeeded = await checkForUpdate('0.1.0')

    expect(succeeded).toBe(false)
  })

  it('returns false when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    const succeeded = await checkForUpdate('0.1.0')

    expect(succeeded).toBe(false)
  })
})
