import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/types/ipc-contract'
import type { CreateProjectInput, CreateSldInput, Project, Sld } from '../shared/types/entities'

const api = {
  projects: {
    list: (): Promise<Project[]> => ipcRenderer.invoke(IPC.projectsList),
    create: (input: CreateProjectInput): Promise<Project> =>
      ipcRenderer.invoke(IPC.projectsCreate, input)
  },
  slds: {
    listByProject: (projectId: string): Promise<Sld[]> =>
      ipcRenderer.invoke(IPC.sldsListByProject, projectId),
    create: (input: CreateSldInput): Promise<Sld> => ipcRenderer.invoke(IPC.sldsCreate, input)
  }
}

export type Api = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
