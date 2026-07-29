import type { AppSettings } from '@shared/types/entities'

// A component-type override (Settings > Components) wins over the
// project-wide Preferred Brands list when set for that type; otherwise the
// global list applies unchanged.
export function resolveEffectivePreferredBrands(
  componentType: string,
  settings: Pick<AppSettings, 'preferredBrands' | 'preferredBrandsByType'>
): string[] {
  const override = settings.preferredBrandsByType[componentType]
  return override ? [override] : settings.preferredBrands
}
