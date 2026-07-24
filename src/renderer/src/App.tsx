import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { SplashScreen } from '@renderer/components/animation/SplashScreen'
import { SetupScreen } from '@renderer/components/auth/SetupScreen'
import { LoginScreen } from '@renderer/components/auth/LoginScreen'
import { TopBar } from '@renderer/components/layout/TopBar'
import { SldListColumn } from '@renderer/components/layout/SldListColumn'
import { CenterPanel } from '@renderer/components/layout/CenterPanel'
import { QuotationListColumn } from '@renderer/components/layout/QuotationListColumn'
import { CreateProjectDialog } from '@renderer/components/layout/CreateProjectDialog'
import { AddSldDialog } from '@renderer/components/layout/AddSldDialog'
import { CatalogModal } from '@renderer/components/catalog/CatalogModal'
import { SettingsPage } from '@renderer/components/settings/SettingsPage'
import { useUiStore } from '@renderer/state/useUiStore'
import { useProjects } from '@renderer/state/queries/useProjects'
import { useDeleteSld, useSlds, useUploadSld } from '@renderer/state/queries/useSlds'
import { useDeleteQuotation, useQuotationsByProject } from '@renderer/state/queries/useQuotation'
import { useOpenFlagCountsByProject } from '@renderer/state/queries/useFlags'
import { useExportProject } from '@renderer/state/queries/useExport'
import { useAuthStatus, useLogout } from '@renderer/state/queries/useAuth'
import { useSettings } from '@renderer/state/queries/useSettings'
import type { Quotation, Sld } from '@shared/types/entities'

function App(): React.JSX.Element {
  const { data: authStatus, isLoading: authLoading } = useAuthStatus()
  const logout = useLogout()
  const { data: settings } = useSettings()

  useEffect(() => {
    document.documentElement.dataset.fontScale = settings?.fontScale ?? 'md'
  }, [settings?.fontScale])

  const {
    selectedProjectId,
    selectedSldId,
    selectedQuotationId,
    panelMode,
    selectProject,
    selectSld,
    selectQuotation,
    clearSld,
    clearQuotation,
    setPanelMode
  } = useUiStore()

  const { data: projects = [], isLoading: projectsLoading } = useProjects()
  const { data: slds = [] } = useSlds(selectedProjectId)
  const { data: quotations = [] } = useQuotationsByProject(selectedProjectId)
  const { data: flagCounts } = useOpenFlagCountsByProject(selectedProjectId)
  const uploadSld = useUploadSld()
  const deleteSld = useDeleteSld()
  const deleteQuotation = useDeleteQuotation()
  const exportProject = useExportProject()

  const setExtractionProgress = useUiStore((s) => s.setExtractionProgress)
  const extractionProgress = useUiStore((s) => s.extractionProgress)

  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [addSldOpen, setAddSldOpen] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Cold-launch splash: keep it up until the first data load resolves, with a
  // floor so it doesn't just flash on a warm/fast start.
  const [splashMinTimeElapsed, setSplashMinTimeElapsed] = useState(false)
  useEffect(() => {
    const timeout = setTimeout(() => setSplashMinTimeElapsed(true), 500)
    return () => clearTimeout(timeout)
  }, [])
  const showSplash = projectsLoading || !splashMinTimeElapsed

  useEffect(() => window.api.ai.onProgress(setExtractionProgress), [setExtractionProgress])

  // Auto-select the most recently created project once the list loads.
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      selectProject(projects[0].id)
    }
  }, [projects, selectedProjectId, selectProject])

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null
  const sldsById = useMemo(() => new Map(slds.map((sld) => [sld.id, sld])), [slds])
  const selectedSld = selectedSldId ? (sldsById.get(selectedSldId) ?? null) : null

  const matcherFlagCount = flagCounts?.matcher ?? 0
  const aiFlagCount = flagCounts?.ai ?? 0
  const manualFlagCount = flagCounts?.human ?? 0

  const handleSelectSld = (sldId: string): void => {
    selectSld(sldId, null)
  }

  const handleDeleteSld = async (sld: Sld): Promise<void> => {
    const confirmed = window.confirm(
      `Remove ${sld.filename} from this project? This can't be undone from the UI.`
    )
    if (!confirmed) return
    await deleteSld.mutateAsync({ sldId: sld.id, projectId: sld.projectId })
    if (selectedSldId === sld.id) clearSld()
  }

  const handleDeleteQuotation = async (quotation: Quotation): Promise<void> => {
    const confirmed = window.confirm(
      `Delete quotation ${quotation.code}? This can't be undone — it can always be regenerated from the SLD's extraction.`
    )
    if (!confirmed || !selectedProject) return
    await deleteQuotation.mutateAsync({
      quotationId: quotation.id,
      sldId: quotation.sldId,
      projectId: selectedProject.id
    })
    if (selectedQuotationId === quotation.id) clearQuotation()
  }

  if (authLoading) {
    return (
      <AnimatePresence>
        <SplashScreen key="auth-splash" />
      </AnimatePresence>
    )
  }

  if (authStatus?.state === 'needsSetup') {
    return <SetupScreen />
  }

  if (authStatus?.state === 'unauthenticated') {
    return <LoginScreen />
  }

  return (
    <>
      <AnimatePresence>{showSplash && <SplashScreen key="splash" />}</AnimatePresence>
      <div className="flex h-screen flex-col bg-bg text-text-primary">
        <TopBar
          project={selectedProject}
          matcherFlagCount={matcherFlagCount}
          aiFlagCount={aiFlagCount}
          manualFlagCount={manualFlagCount}
          extractionProgress={extractionProgress}
          onUploadClick={() =>
            selectedProject && uploadSld.mutate({ projectId: selectedProject.id })
          }
          onNewProject={() => setCreateProjectOpen(true)}
          onOpenCatalog={() => setCatalogOpen(true)}
          onExportProject={() => selectedProject && exportProject.mutate(selectedProject.id)}
          exportPending={exportProject.isPending}
          username={authStatus?.user?.username ?? null}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="flex flex-1 overflow-hidden">
          <SldListColumn
            slds={slds}
            selectedSldId={selectedSldId}
            onSelect={handleSelectSld}
            onAddSld={() => setAddSldOpen(true)}
            onDeleteSld={handleDeleteSld}
            addDisabled={!selectedProject}
          />
          <CenterPanel sld={selectedSld} panelMode={panelMode} onPanelModeChange={setPanelMode} />
          <QuotationListColumn
            quotations={quotations}
            sldsById={sldsById}
            selectedQuotationId={selectedQuotationId}
            onSelect={(quotationId) => {
              const quotation = quotations.find((q) => q.id === quotationId)
              if (quotation) selectQuotation(quotationId, quotation.sldId)
            }}
            onDeleteQuotation={handleDeleteQuotation}
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
        <CatalogModal open={catalogOpen} onClose={() => setCatalogOpen(false)} />
        <SettingsPage
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          user={authStatus?.user ?? null}
          onLogout={() => {
            setSettingsOpen(false)
            logout.mutate()
          }}
        />
      </div>
    </>
  )
}

export default App
