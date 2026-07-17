import { registerProjectsIpc } from './projects.ipc'
import { registerSldsIpc } from './slds.ipc'
import { registerAnnotationsIpc } from './annotations.ipc'

export function registerAllIpc(): void {
  registerProjectsIpc()
  registerSldsIpc()
  registerAnnotationsIpc()
}
