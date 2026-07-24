import { useCatalogStatus, useDistinctMakers } from '@renderer/state/queries/useCatalog'
import { useSettings, useUpdateSettings } from '@renderer/state/queries/useSettings'

export function PreferredBrandsSection(): React.JSX.Element {
  const { data: status } = useCatalogStatus()
  const { data: makers = [] } = useDistinctMakers()
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  const preferredBrands = settings?.preferredBrands ?? []

  const toggleBrand = (brand: string): void => {
    const next = preferredBrands.includes(brand)
      ? preferredBrands.filter((b) => b !== brand)
      : [...preferredBrands, brand]
    updateSettings.mutate({ preferredBrands: next })
  }

  if (!status || status.itemCount === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Preferred Brands</h3>
        <p className="text-xs text-text-muted">
          Load a catalog first (see Catalog Path) to choose preferred brands.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Preferred Brands</h3>
      <p className="text-xs text-text-secondary">
        Brands found in your loaded catalog. Select the ones you quote from most often.
      </p>
      <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
        {makers.map((maker) => (
          <label key={maker} className="flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={preferredBrands.includes(maker)}
              onChange={() => toggleBrand(maker)}
              className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
            />
            {maker}
          </label>
        ))}
        {makers.length === 0 && (
          <p className="text-xs text-text-muted">No maker values found in the catalog.</p>
        )}
      </div>
    </div>
  )
}
