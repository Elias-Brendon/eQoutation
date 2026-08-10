import { describe, it, expect, vi } from 'vitest'
import { addCatalogItem } from './catalogWriter'
import * as catalogLoader from './catalogLoader'

// Only the missing-file guard is unit-testable here: once past it,
// addCatalogItem reads/writes a real .xlsx via ExcelJS, which this repo
// deliberately verifies live instead (see quotationsRepo.dbtest.ts).
describe('addCatalogItem', () => {
  it('throws CAT-006 when the last-synced source file no longer exists on disk', async () => {
    vi.spyOn(catalogLoader, 'getCatalogStatus').mockReturnValue({
      catalogDir: 'C:/fake-dir',
      sourcePath: 'C:/fake-dir/does-not-exist-12345.xlsx',
      itemCount: 0,
      lastSyncedAt: null
    })

    await expect(addCatalogItem({ sku: 'X', description: 'Y' })).rejects.toThrow('CAT-006')
  })
})
