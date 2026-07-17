import { useEffect, useMemo, useState } from 'react'
import { TopBar } from '@renderer/components/layout/TopBar'
import { SldListColumn } from '@renderer/components/layout/SldListColumn'
import { CenterPanel } from '@renderer/components/layout/CenterPanel'
import { QuotationListColumn } from '@renderer/components/layout/QuotationListColumn'
import { CreateProjectDialog } from '@renderer/components/layout/CreateProjectDialog'
import { AddSldDialog } from '@renderer/components/layout/AddSldDialog'
import { useUiStore } from '@renderer/state/useUiStore'
import { useProjects } from '@renderer/state/queries/useProjects'
import { useSlds } from '@renderer/state/queries/useSlds'

function App(): React.JSX.Element {
  const {
    selectedProjectId,
    selectedSldId,
    selectedQuotationId,
    activeTab,
    selectProject,
    selectSld,
    setActiveTab
  } = useUiStore()

  const { data: projects = [] } = useProjects()
  const { data: slds = [] } = useSlds(selectedProjectId)

  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [addSldOpen, setAddSldOpen] = useState(false)

  // Auto-select the most recently created project once the list loads.
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      selectProject(projects[0].id)
    }
  }, [projects, selectedProjectId, selectProject])

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null
  const sldsById = useMemo(() => new Map(slds.map((sld) => [sld.id, sld])), [slds])
  const selectedSld = selectedSldId ? (sldsById.get(selectedSldId) ?? null) : null

  // Quotations aren't generated until Stage 6/7 — real empty state for now.
  const quotations: never[] = []
  const aiFlagCount = 0
  const manualFlagCount = 0

  const handleSelectSld = (sldId: string): void => {
    selectSld(sldId, null)
  }

  return (
    <div className="flex h-screen flex-col bg-bg text-text-primary">
      <TopBar
        project={selectedProject}
        aiFlagCount={aiFlagCount}
        manualFlagCount={manualFlagCount}
        onUploadClick={() => console.log('Upload PDF — wired in Stage 3')}
        onNewProject={() => setCreateProjectOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <SldListColumn
          slds={slds}
          selectedSldId={selectedSldId}
          onSelect={handleSelectSld}
          onAddSld={() => setAddSldOpen(true)}
          addDisabled={!selectedProject}
        />
        <CenterPanel
          sld={selectedSld}
          quotation={null}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onApprove={() => console.log('Approve — wired in Stage 8')}
          onReject={() => console.log('Reject — wired in Stage 8')}
          onComment={() => console.log('Add comment — wired in Stage 8')}
          onExport={() => console.log('Export quotation — wired in Stage 11')}
        />
        <QuotationListColumn
          quotations={quotations}
          sldsById={sldsById}
          selectedQuotationId={selectedQuotationId}
          onSelect={() => {}}
        />
      </div>

      <CreateProjectDialog
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreated={(projectId) => {
          selectProject(projectId)
          setCreateProjectOpen(false)
        }}
      />
      {selectedProject && (
        <AddSldDialog
          open={addSldOpen}
          projectId={selectedProject.id}
          onClose={() => setAddSldOpen(false)}
        />
      )}
    </div>
  )
}

export default App
