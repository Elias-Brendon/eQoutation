import { useState } from 'react'
import { Modal } from '@renderer/components/common/Modal'
import { cn } from '@renderer/lib/cn'
import { CatalogPathSection } from './sections/CatalogPathSection'
import { PreferredBrandsSection } from './sections/PreferredBrandsSection'
import { ComponentsSection } from './sections/ComponentsSection'
import { ProjectSectorsSection } from './sections/ProjectSectorsSection'
import { CompaniesSection } from './sections/CompaniesSection'
import { ExtractionRulesSection } from './sections/ExtractionRulesSection'
import { AiModelSection } from './sections/AiModelSection'
import { ApiKeysSection } from './sections/ApiKeysSection'
import { MarginsSection } from './sections/MarginsSection'
import { AccountSection } from './sections/AccountSection'
import { FontSizeSection } from './sections/FontSizeSection'
import { TrainingDataSection } from './sections/TrainingDataSection'
import { UserManualSection } from './sections/UserManualSection'
import { AboutSection } from './sections/AboutSection'
import type { AuthUser } from '@shared/types/entities'

type SectionId =
  | 'catalogPath'
  | 'preferredBrands'
  | 'components'
  | 'projectSectors'
  | 'companies'
  | 'extractionRules'
  | 'aiModel'
  | 'apiKeys'
  | 'margins'
  | 'account'
  | 'fontSize'
  | 'trainingData'
  | 'userManual'
  | 'about'

interface NavItem {
  id: SectionId
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'catalogPath', label: 'Catalog Path' },
  { id: 'preferredBrands', label: 'Preferred Brands' },
  { id: 'components', label: 'Components' },
  { id: 'projectSectors', label: 'Project Sectors' },
  { id: 'companies', label: 'Companies' },
  { id: 'extractionRules', label: 'Extraction Rules' },
  { id: 'aiModel', label: 'AI Model' },
  { id: 'apiKeys', label: 'API Keys' },
  { id: 'margins', label: 'Margins' },
  { id: 'account', label: 'Account' },
  { id: 'fontSize', label: 'Font Size' },
  { id: 'trainingData', label: 'Training Data' },
  { id: 'userManual', label: 'User Manual' },
  { id: 'about', label: 'About' }
]

interface SettingsPageProps {
  open: boolean
  onClose: () => void
  user: AuthUser | null
  onLogout: () => void
}

export function SettingsPage({
  open,
  onClose,
  user,
  onLogout
}: SettingsPageProps): React.JSX.Element {
  const [activeSection, setActiveSection] = useState<SectionId>('catalogPath')

  return (
    <Modal open={open} onClose={onClose} title="Settings" className="w-[880px] max-w-[95vw]">
      <div className="flex h-[560px] max-h-[80vh] gap-4">
        <nav className="w-44 shrink-0 border-r border-border pr-3">
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    'w-full rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors',
                    activeSection === item.id
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  )}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex-1 overflow-y-auto pr-1">
          {activeSection === 'catalogPath' && <CatalogPathSection />}
          {activeSection === 'preferredBrands' && <PreferredBrandsSection />}
          {activeSection === 'components' && <ComponentsSection />}
          {activeSection === 'projectSectors' && <ProjectSectorsSection />}
          {activeSection === 'companies' && <CompaniesSection />}
          {activeSection === 'extractionRules' && <ExtractionRulesSection />}
          {activeSection === 'aiModel' && <AiModelSection />}
          {activeSection === 'apiKeys' && <ApiKeysSection />}
          {activeSection === 'margins' && <MarginsSection />}
          {activeSection === 'account' && <AccountSection user={user} onLogout={onLogout} />}
          {activeSection === 'fontSize' && <FontSizeSection />}
          {activeSection === 'trainingData' && <TrainingDataSection />}
          {activeSection === 'userManual' && <UserManualSection />}
          {activeSection === 'about' && <AboutSection />}
        </div>
      </div>
    </Modal>
  )
}
