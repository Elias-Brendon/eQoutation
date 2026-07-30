import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/types/ipc-contract'
import type {
  Annotation,
  AppSettings,
  AuthStatus,
  AuthUser,
  CatalogItem,
  CatalogReloadResult,
  CatalogStatus,
  ChangePasswordInput,
  CreateAnnotationInput,
  CreateProjectInput,
  Extraction,
  ExtractionProgressEvent,
  FeedbackLogEntry,
  FeedbackResolveLineInput,
  Flag,
  FlagOriginCounts,
  FxRateResult,
  LoginInput,
  NewCatalogItemInput,
  PickCatalogDirResult,
  Project,
  ProjectTokenUsage,
  Quotation,
  QuotationComment,
  QuotationLine,
  RaiseFlagInput,
  RecoveryQuestionResult,
  ResetPasswordInput,
  ResolveUnmatchedLineResult,
  SecretKeyName,
  SetSecurityQuestionInput,
  SetupInput,
  Sld,
  TestApiKeyResult,
  UpdateProjectCurrencySettingsInput,
  UploadSldInput
} from '../shared/types/entities'

const api = {
  auth: {
    getStatus: (): Promise<AuthStatus> => ipcRenderer.invoke(IPC.authGetStatus),
    setup: (input: SetupInput): Promise<AuthUser> => ipcRenderer.invoke(IPC.authSetup, input),
    login: (input: LoginInput): Promise<AuthUser> => ipcRenderer.invoke(IPC.authLogin, input),
    logout: (): Promise<void> => ipcRenderer.invoke(IPC.authLogout),
    getRecoveryQuestion: (username: string): Promise<RecoveryQuestionResult> =>
      ipcRenderer.invoke(IPC.authGetRecoveryQuestion, username),
    resetPassword: (input: ResetPasswordInput): Promise<AuthUser> =>
      ipcRenderer.invoke(IPC.authResetPassword, input),
    setSecurityQuestion: (input: SetSecurityQuestionInput): Promise<void> =>
      ipcRenderer.invoke(IPC.authSetSecurityQuestion, input),
    changePassword: (input: ChangePasswordInput): Promise<void> =>
      ipcRenderer.invoke(IPC.authChangePassword, input)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.settingsUpdate, patch),
    pickCatalogDir: (): Promise<PickCatalogDirResult | null> =>
      ipcRenderer.invoke(IPC.settingsPickCatalogDir)
  },
  secrets: {
    setApiKey: (keyName: SecretKeyName, key: string): Promise<void> =>
      ipcRenderer.invoke(IPC.secretsSetApiKey, keyName, key),
    getApiKeyMasked: (keyName: SecretKeyName): Promise<string | null> =>
      ipcRenderer.invoke(IPC.secretsGetApiKeyMasked, keyName),
    testApiKey: (keyName: SecretKeyName, key: string): Promise<TestApiKeyResult> =>
      ipcRenderer.invoke(IPC.secretsTestApiKey, keyName, key),
    deleteApiKey: (keyName: SecretKeyName): Promise<void> =>
      ipcRenderer.invoke(IPC.secretsDeleteApiKey, keyName)
  },
  projects: {
    list: (): Promise<Project[]> => ipcRenderer.invoke(IPC.projectsList),
    create: (input: CreateProjectInput): Promise<Project> =>
      ipcRenderer.invoke(IPC.projectsCreate, input),
    updateCurrencySettings: (input: UpdateProjectCurrencySettingsInput): Promise<Project> =>
      ipcRenderer.invoke(IPC.projectsUpdateCurrencySettings, input)
  },
  fx: {
    getRate: (targetCurrency: string, forceRefresh = false): Promise<FxRateResult> =>
      ipcRenderer.invoke(IPC.fxGetRate, targetCurrency, forceRefresh)
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
    listBySld: (sldId: string): Promise<Annotation[]> =>
      ipcRenderer.invoke(IPC.annotationsListBySld, sldId),
    create: (input: CreateAnnotationInput): Promise<Annotation> =>
      ipcRenderer.invoke(IPC.annotationsCreate, input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.annotationsDelete, id)
  },
  catalog: {
    getStatus: (): Promise<CatalogStatus> => ipcRenderer.invoke(IPC.catalogGetStatus),
    reload: (): Promise<CatalogReloadResult> => ipcRenderer.invoke(IPC.catalogReload),
    search: (query: string, limit?: number): Promise<CatalogItem[]> =>
      ipcRenderer.invoke(IPC.catalogSearch, query, limit),
    openFolder: (): Promise<void> => ipcRenderer.invoke(IPC.catalogOpenFolder),
    listDistinctMakers: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC.catalogListDistinctMakers)
  },
  ai: {
    extractSld: (sldId: string, options?: { force?: boolean }): Promise<Extraction> =>
      ipcRenderer.invoke(IPC.aiExtractSld, sldId, options),
    getExtraction: (sldId: string): Promise<Extraction | null> =>
      ipcRenderer.invoke(IPC.aiGetExtraction, sldId),
    getProjectTokenUsage: (projectId: string): Promise<ProjectTokenUsage> =>
      ipcRenderer.invoke(IPC.aiGetProjectTokenUsage, projectId),
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
      ipcRenderer.invoke(IPC.quotationsExport, quotationId),
    approve: (quotationId: string, comment?: string): Promise<Quotation> =>
      ipcRenderer.invoke(IPC.quotationsApprove, quotationId, comment),
    reject: (quotationId: string, comment?: string): Promise<Quotation> =>
      ipcRenderer.invoke(IPC.quotationsReject, quotationId, comment),
    addComment: (quotationId: string, body: string): Promise<QuotationComment> =>
      ipcRenderer.invoke(IPC.quotationsAddComment, quotationId, body),
    listComments: (quotationId: string): Promise<QuotationComment[]> =>
      ipcRenderer.invoke(IPC.quotationsListComments, quotationId),
    delete: (quotationId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.quotationsDelete, quotationId),
    updateLineMargin: (lineId: string, margin: number): Promise<void> =>
      ipcRenderer.invoke(IPC.quotationLinesUpdateMargin, lineId, margin),
    updatePanelMargin: (quotationId: string, panelName: string, margin: number): Promise<void> =>
      ipcRenderer.invoke(IPC.quotationPanelsUpdateMargin, quotationId, panelName, margin)
  },
  flags: {
    listByQuotation: (quotationId: string): Promise<Flag[]> =>
      ipcRenderer.invoke(IPC.flagsListByQuotation, quotationId),
    countOpenByProject: (projectId: string): Promise<FlagOriginCounts> =>
      ipcRenderer.invoke(IPC.flagsCountOpenByProject, projectId),
    raise: (input: RaiseFlagInput): Promise<Flag> => ipcRenderer.invoke(IPC.flagsRaise, input),
    resolve: (
      id: string,
      resolutionNote?: string,
      outcome?: { action: 'accepted' | 'corrected'; value: string }
    ): Promise<void> => ipcRenderer.invoke(IPC.flagsResolve, id, resolutionNote, outcome),
    resolveUnmatchedLine: (flagId: string): Promise<ResolveUnmatchedLineResult> =>
      ipcRenderer.invoke(IPC.flagsResolveUnmatchedLine, flagId),
    linkLineToCatalogItem: (
      flagId: string | null,
      lineId: string,
      catalogItemId: string
    ): Promise<void> =>
      ipcRenderer.invoke(IPC.flagsLinkLineToCatalogItem, flagId, lineId, catalogItemId),
    addCatalogItemAndLink: (
      flagId: string | null,
      lineId: string,
      input: NewCatalogItemInput
    ): Promise<CatalogItem> =>
      ipcRenderer.invoke(IPC.flagsAddCatalogItemAndLink, flagId, lineId, input)
  },
  feedback: {
    resolveLine: (input: FeedbackResolveLineInput): Promise<QuotationLine> =>
      ipcRenderer.invoke(IPC.feedbackResolveLine, input),
    listByLine: (lineId: string): Promise<FeedbackLogEntry[]> =>
      ipcRenderer.invoke(IPC.feedbackListByLine, lineId)
  },
  export: {
    project: (projectId: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.exportProject, projectId)
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
