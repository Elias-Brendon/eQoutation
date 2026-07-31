import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { FileText, Receipt } from 'lucide-react'
import { SplashScreen } from '@renderer/components/animation/SplashScreen'
import { SetupScreen } from '@renderer/components/auth/SetupScreen'
import { LoginScreen } from '@renderer/components/auth/LoginScreen'
import { TopBar } from '@renderer/components/layout/TopBar'
import { SldListColumn } from '@renderer/components/layout/SldListColumn'
import { CenterPanel } from '@renderer/components/layout/CenterPanel'
import { QuotationListColumn } from '@renderer/components/layout/QuotationListColumn'
import { SidebarRail } from '@renderer/components/layout/SidebarRail'
import { CreateProjectDialog } from '@renderer/components/layout/CreateProjectDialog'
import { ProjectSwitcherModal } from '@renderer/components/layout/ProjectSwitcherModal'
import { AddSldDialog } from '@renderer/components/layout/AddSldDialog'
import { CatalogModal } from '@renderer/components/catalog/CatalogModal'
import { SettingsPage } from '@renderer/components/settings/SettingsPage'
import { useUiStore } from '@renderer/state/useUiStore'
import { useWindowWidth } from '@renderer/hooks/useWindowWidth'
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts'
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
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false)

  // Below this width: the two side columns collapse to icon rails (pinned
  // open on demand as an overlay) so the center PDF+Quotation split keeps
  // its room, and the TopBar drops its button text labels (icon + tooltip
  // only) to avoid overflowing off-window. Pin state resets when the
  // columns un-collapse (reset during render, not an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect) so a stale pin
  // from a previous narrow session doesn't reopen unexpectedly the next
  // time the window narrows again.
  const windowWidth = useWindowWidth()
  const isNarrowWindow = windowWidth < 1280
  const [sldRailPinned, setSldRailPinned] = useState(false)
  const [quotationRailPinned, setQuotationRailPinned] = useState(false)
  const [prevIsNarrowWindow, setPrevIsNarrowWindow] = useState(isNarrowWindow)
  if (isNarrowWindow !== prevIsNarrowWindow) {
    setPrevIsNarrowWindow(isNarrowWindow)
    if (!isNarrowWindow) {
      setSldRailPinned(false)
      setQuotationRailPinned(false)
    }
  }

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

  const shortcuts = useMemo(
    () => [
      {
        key: 'u',
        ctrl: true,
        handler: () => selectedProject && uploadSld.mutate({ projectId: selectedProject.id })
      },
      { key: 'n', ctrl: true, shift: true, handler: () => setCreateProjectOpen(true) },
      {
        key: 'e',
        ctrl: true,
        handler: () => selectedProject && exportProject.mutate(selectedProject.id)
      },
      { key: '1', ctrl: true, handler: () => selectedSld && setPanelMode('split') },
      { key: '2', ctrl: true, handler: () => selectedSld && setPanelMode('pdf-full') },
      { key: '3', ctrl: true, handler: () => selectedSld && setPanelMode('quotation-full') }
    ],
    [selectedProject, selectedSld, uploadSld, exportProject, setPanelMode]
  )
  useKeyboardShortcuts(shortcuts)

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
          compact={isNarrowWindow}
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
          onOpenProjectSwitcher={() => setProjectSwitcherOpen(true)}
          onExportProject={() => selectedProject && exportProject.mutate(selectedProject.id)}
          exportPending={exportProject.isPending}
          username={authStatus?.user?.username ?? null}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="flex flex-1 overflow-hidden">
          <SidebarRail
            side="left"
            label="SLDs"
            icon={FileText}
            count={slds.length}
            collapsed={isNarrowWindow}
            pinned={sldRailPinned}
            onTogglePinned={() => setSldRailPinned((p) => !p)}
          >
            <SldListColumn
              slds={slds}
              selectedSldId={selectedSldId}
              onSelect={handleSelectSld}
              onAddSld={() => setAddSldOpen(true)}
              onDeleteSld={handleDeleteSld}
              addDisabled={!selectedProject}
            />
          </SidebarRail>
          <CenterPanel sld={selectedSld} panelMode={panelMode} onPanelModeChange={setPanelMode} />
          <SidebarRail
            side="right"
            label="Quotations"
            icon={Receipt}
            count={quotations.length}
            collapsed={isNarrowWindow}
            pinned={quotationRailPinned}
            onTogglePinned={() => setQuotationRailPinned((p) => !p)}
          >
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
          </SidebarRail>
        </div>

        <CreateProjectDialog
          open={createProjectOpen}
          onClose={() => setCreateProjectOpen(false)}
          onCreated={(projectId) => {
            selectProject(projectId)
            setCreateProjectOpen(false)
          }}
        />
        <ProjectSwitcherModal
          open={projectSwitcherOpen}
          onClose={() => setProjectSwitcherOpen(false)}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={selectProject}
        />
        {selectedProject && (
          <AddSldDialog
            open={addSldOpen}
            projectId={selectedProject.id}
            onClose={() => setAddSldOpen(false)}
          />
        )}
        <CatalogModal
          open={catalogOpen}
          onClose={() => setCatalogOpen(false)}
          project={selectedProject}
        />
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
