import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/types/ipc-contract'
import type {
  Annotation,
  CatalogItem,
  CatalogReloadResult,
  CatalogStatus,
  CreateAnnotationInput,
  CreateProjectInput,
  Extraction,
  ExtractionProgressEvent,
  Project,
  Quotation,
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
  },
  catalog: {
    getStatus: (): Promise<CatalogStatus> => ipcRenderer.invoke(IPC.catalogGetStatus),
    reload: (): Promise<CatalogReloadResult> => ipcRenderer.invoke(IPC.catalogReload),
    search: (query: string, limit?: number): Promise<CatalogItem[]> =>
      ipcRenderer.invoke(IPC.catalogSearch, query, limit)
  },
  ai: {
    extractSld: (sldId: string): Promise<Extraction> => ipcRenderer.invoke(IPC.aiExtractSld, sldId),
    getExtraction: (sldId: string): Promise<Extraction | null> =>
      ipcRenderer.invoke(IPC.aiGetExtraction, sldId),
    onProgress: (callback: (progress: ExtractionProgressEvent) => void): (() => void) => {
      const listener = (_event: unknown, payload: ExtractionProgressEvent): void =>
        callback(payload)
      ipcRenderer.on(IPC.aiExtractionProgress, listener)
      return () => ipcRenderer.removeListener(IPC.aiExtractionProgress, listener)
    }
  },
  quotations: {
    generate: (sldId: string): Promise<Quotation> =>
      ipcRenderer.invoke(IPC.quotationsGenerate, sldId),
    getBySld: (sldId: string): Promise<Quotation | null> =>
      ipcRenderer.invoke(IPC.quotationsGetBySld, sldId),
    listByProject: (projectId: string): Promise<Quotation[]> =>
      ipcRenderer.invoke(IPC.quotationsListByProject, projectId),
    export: (quotationId: string): Promise<Quotation> =>
      ipcRenderer.invoke(IPC.quotationsExport, quotationId)
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
