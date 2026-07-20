import { registerProjectsIpc } from './projects.ipc'
import { registerSldsIpc } from './slds.ipc'
import { registerAnnotationsIpc } from './annotations.ipc'
import { registerCatalogIpc } from './catalog.ipc'
import { registerAiIpc } from './ai.ipc'
import { registerQuotationsIpc } from './quotations.ipc'
import { registerFlagsIpc } from './flags.ipc'

export function registerAllIpc(): void {
  registerProjectsIpc()
  registerSldsIpc()
  registerAnnotationsIpc()
  registerCatalogIpc()
  registerAiIpc()
  registerQuotationsIpc()
  registerFlagsIpc()
}
