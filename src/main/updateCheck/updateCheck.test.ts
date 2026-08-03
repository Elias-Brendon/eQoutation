import { describe, it, expect } from 'vitest'
import { isNewerVersion } from './updateCheck'

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
