import { registerProjectsIpc } from './projects.ipc'
import { registerSldsIpc } from './slds.ipc'

export function registerAllIpc(): void {
  registerProjectsIpc()
  registerSldsIpc()
}
