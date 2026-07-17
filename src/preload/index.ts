import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/types/ipc-contract'
import type {
  Annotation,
  CreateAnnotationInput,
  CreateProjectInput,
  Project,
  Sld,
  UploadSldInput
} from '../shared/types/entities'

const api = {
  projects: {
    list: (): Promise<Project[]> => ipcRenderer.invoke(IPC.projectsList),
    create: (input: CreateProjectInput): Promise<Project> =>
      ipcRenderer.invoke(IPC.projectsCreate, input)
  },
  slds: {
    listByProject: (projectId: string): Promise<Sld[]> =>
      ipcRenderer.invoke(IPC.sldsListByProject, projectId),
    upload: (input: UploadSldInput): Promise<Sld | null> =>
      ipcRenderer.invoke(IPC.sldsUpload, input),
    delete: (sldId: string): Promise<void> => ipcRenderer.invoke(IPC.sldsDelete, sldId),
    readFile: (sldId: string): Promise<Uint8Array> => ipcRenderer.invoke(IPC.sldsReadFile, sldId)
  },
  annotations: {
    listBySldAndPage: (sldId: string, pageNumber: number): Promise<Annotation[]> =>
      ipcRenderer.invoke(IPC.annotationsListBySldAndPage, sldId, pageNumber),
    create: (input: CreateAnnotationInput): Promise<Annotation> =>
      ipcRenderer.invoke(IPC.annotationsCreate, input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.annotationsDelete, id)
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
