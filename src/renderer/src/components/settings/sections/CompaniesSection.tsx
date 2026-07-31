import { EditableListSection } from './EditableListSection'
import { useSettings, useUpdateSettings } from '@renderer/state/queries/useSettings'

export function CompaniesSection(): React.JSX.Element {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  return (
    <EditableListSection
      title="Companies"
      description="Options shown in the project Company dropdown. Add the client/company names you quote for."
      items={settings?.companies ?? []}
      placeholder="Add a company…"
      onChange={(next) => updateSettings.mutate({ companies: next })}
    />
  )
}
