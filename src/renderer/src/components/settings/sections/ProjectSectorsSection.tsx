import { EditableListSection } from './EditableListSection'
import { useSettings, useUpdateSettings } from '@renderer/state/queries/useSettings'

export function ProjectSectorsSection(): React.JSX.Element {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  return (
    <EditableListSection
      title="Project Sectors"
      description="Options shown in the project Sector dropdown. Add, remove, or rename to match how you categorize work."
      items={settings?.projectSectors ?? []}
      placeholder="Add a sector…"
      onChange={(next) => updateSettings.mutate({ projectSectors: next })}
    />
  )
}
