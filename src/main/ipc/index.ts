import { registerAuthIpc } from './auth.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { registerSecretsIpc } from './secrets.ipc'
import { registerProjectsIpc } from './projects.ipc'
import { registerSldsIpc } from './slds.ipc'
import { registerAnnotationsIpc } from './annotations.ipc'
import { registerCatalogIpc } from './catalog.ipc'
import { registerAiIpc } from './ai.ipc'
import { registerQuotationsIpc } from './quotations.ipc'
import { registerFlagsIpc } from './flags.ipc'
import { registerFeedbackIpc } from './feedback.ipc'
import { registerExportIpc } from './export.ipc'

export function registerAllIpc(): void {
  registerAuthIpc()
  registerSettingsIpc()
  registerSecretsIpc()
  registerProjectsIpc()
  registerSldsIpc()
  registerAnnotationsIpc()
  registerCatalogIpc()
  registerAiIpc()
  registerQuotationsIpc()
  registerFlagsIpc()
  registerFeedbackIpc()
  registerExportIpc()
}
