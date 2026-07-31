import { registerAppIpc } from './app.ipc'
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
import { registerFxIpc } from './fx.ipc'

export function registerAllIpc(): void {
  registerAppIpc()
  registerAuthIpc()
  registerSettingsIpc()
  registerSecretsIpc()
  registerProjectsIpc()
  registerFxIpc()
  registerSldsIpc()
  registerAnnotationsIpc()
  registerCatalogIpc()
  registerAiIpc()
  registerQuotationsIpc()
  registerFlagsIpc()
  registerFeedbackIpc()
  registerExportIpc()
}
