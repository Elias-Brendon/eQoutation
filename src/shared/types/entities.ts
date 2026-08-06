export type UserRole = 'admin'
export type AuthStatusState = 'needsSetup' | 'unauthenticated' | 'authenticated'

export interface AuthUser {
  id: string
  username: string
  role: UserRole
  hasRecoveryQuestion: boolean
}

export interface AuthStatus {
  state: AuthStatusState
  user: AuthUser | null
}

export const SECURITY_QUESTIONS = [
  "What was your first pet's name?",
  'What city were you born in?',
  'What was the make of your first car?',
  "What is your mother's maiden name?",
  'What was the name of your first school?'
] as const

export interface SetupInput {
  username: string
  password: string
  securityQuestion: string
  securityAnswer: string
}

export interface LoginInput {
  username: string
  password: string
  rememberMe: boolean
}

export interface RecoveryQuestionResult {
  question: string | null
}

export interface ResetPasswordInput {
  username: string
  answer: string
  newPassword: string
}

export interface SetSecurityQuestionInput {
  securityQuestion: string
  securityAnswer: string
}

export type FontScale = 'sm' | 'md' | 'lg'

export interface AppSettings {
  catalogDir: string
  preferredBrands: string[]
  /** componentType -> single preferred brand; absent/unset falls back to preferredBrands. */
  preferredBrandsByType: Record<string, string>
  enabledComponentTypes: string[]
  /** Options shown in the project Sector dropdown — fully user-owned, no fixed baseline. */
  projectSectors: string[]
  /** Options shown in the project Company dropdown — fully user-owned, starts empty. */
  companies: string[]
  /** Free-text rules appended to every AI extraction prompt, alongside the built-in rules. */
  customExtractionRules: string[]
  aiModel: string
  aiProvider: 'anthropic' | 'openai-compatible'
  openaiCompatibleBaseUrl: string
  openaiCompatibleModel: string
  confidenceThreshold: number
  maxExtractionRetries: number
  defaultMargin: number
  fontScale: FontScale
  /** Font size in px for the AI annotation info popup shown on the PDF diagram. */
  annotationFontSize: number
  /** Latest version the user dismissed the "update available" notice for — null if never dismissed. */
  dismissedUpdateVersion: string | null
  /** Latest model list fetched from Anthropic via "Test connection" — null until a key has ever been tested successfully. */
  cachedAiModels: { id: string; label: string }[] | null
}

export interface ChangePasswordInput {
  oldPassword: string
  newPassword: string
}

export interface TestApiKeyResult {
  ok: boolean
  error?: string
  models?: { id: string; label: string }[]
}

export interface PickCatalogDirResult {
  settings: AppSettings
  reload: CatalogReloadResult
}

export type SldStatus = 'done' | 'in_progress' | 'rejected'
export type QuotationStatus = 'generating' | 'pending_review' | 'approved' | 'rejected'
/** Project-level status, independent of any individual quotation's status — reuses the same 4 values for label/UI consistency. */
export type ProjectStatus = QuotationStatus
export type FlagOrigin = 'matcher' | 'ai' | 'human'
export type FlagStatus = 'open' | 'resolved'
export type FlagSeverity = 'info' | 'warning'
export type PanelMode = 'split' | 'pdf-full' | 'quotation-full'

export interface Project {
  id: string
  name: string
  substationLabel: string
  /** ISO-4217 currency code, e.g. 'MYR', 'USD'. */
  currency: string
  /** Units of `currency` per 1 MYR (the catalog's native currency). Always 1 when currency is MYR. */
  exchangeRate: number
  exchangeRateIsManual: boolean
  exchangeRateUpdatedAt: string | null
  aiProgressPct: number
  createdAt: string
  updatedAt: string
  /** Overrides Settings.aiModel for this project's extractions when set; null uses the global default. */
  aiModelOverride: string | null
  sector: string | null
  quotationNumber: string
  company: string | null
  coordinator: string | null
  status: ProjectStatus
  createdBy: string | null
}

export interface CreateProjectInput {
  name: string
  substationLabel?: string
  sector?: string
  company?: string
  coordinator?: string
}

export interface UpdateProjectAiModelOverrideInput {
  projectId: string
  aiModelOverride: string | null
}

export interface UpdateProjectDetailsInput {
  projectId: string
  name?: string
  sector?: string | null
  company?: string | null
  coordinator?: string | null
  status?: ProjectStatus
}

export interface UpdateProjectCurrencySettingsInput {
  projectId: string
  currency: string
  /** Present when switching currency (live-fetched) or setting a manual override; omitted/ignored for MYR. */
  exchangeRate?: number
  exchangeRateIsManual: boolean
}

export interface FxRateResult {
  rate: number
  fetchedAt: string
  /** True when served from the once-a-day cache instead of hitting Frankfurter. */
  fromCache: boolean
}

export type SecretKeyName = 'anthropicApiKey' | 'openaiCompatibleApiKey'

export interface Sld {
  id: string
  projectId: string
  filename: string
  filePath: string
  sectionGroup: string
  status: SldStatus
  createdAt: string
  updatedAt: string
}

export interface UploadSldInput {
  projectId: string
  sectionGroup?: string
}

export type QuotationLineMatchStatus = 'matched' | 'unknown'

export interface QuotationLine {
  id: string
  quotationId: string
  catalogItemId: string | null
  pageNumber: number
  panelName: string
  tag: string
  sku: string
  componentType: string
  description: string
  maker: string
  qty: number
  uom: string
  listPrice: number
  discountFactor: number
  unitCost: number
  totalCost: number
  margin: number
  quotePrice: number
  matchStatus: QuotationLineMatchStatus
  matchConfidence: number
  aiConfidence: number
}

export interface AddQuotationLineInput {
  pageNumber: number
  panelName: string
  qty: number
}

export interface Quotation {
  id: string
  sldId: string
  extractionId: string | null
  code: string
  status: QuotationStatus
  excelFilePath: string | null
  lines: QuotationLine[]
  createdAt: string
  updatedAt: string
}

export interface Flag {
  id: string
  quotationId: string
  quotationLineId: string | null
  origin: FlagOrigin
  severity: FlagSeverity
  message: string
  pageNumber: number | null
  status: FlagStatus
  resolutionNote: string | null
  createdAt: string
  resolvedAt: string | null
}

export interface RaiseFlagInput {
  quotationId: string
  quotationLineId?: string | null
  severity?: FlagSeverity
  message: string
  pageNumber?: number | null
}

export type FlagOriginCounts = Record<FlagOrigin, number>

export interface QuotationComment {
  id: string
  quotationId: string
  body: string
  createdAt: string
}

export type AnnotationShapeType = 'freehand' | 'pin' | 'circle' | 'rectangle' | 'text'
export type AnnotationAuthorType = 'human' | 'ai'

export interface AnnotationPoint {
  x: number
  y: number
}

export interface Annotation {
  id: string
  sldId: string
  pageNumber: number
  authorType: AnnotationAuthorType
  shapeType: AnnotationShapeType
  points: AnnotationPoint[]
  color: string
  strokeWidth: number
  commentText: string | null
  createdAt: string
  linkedFlagId: string | null
  linkedQuotationLineId: string | null
  resolvedAt: string | null
}

export interface CreateAnnotationInput {
  sldId: string
  pageNumber: number
  shapeType: AnnotationShapeType
  points: AnnotationPoint[]
  color: string
  strokeWidth?: number
  commentText?: string
}

export interface CatalogItem {
  id: string
  sku: string
  description: string
  maker: string
  family: string
  series: string
  listPrice: number
  discountFactor: number
  unitPrice: number
  uom: string
  sourceRow: number | null
  updatedAt: string
}

export interface CatalogStatus {
  catalogDir: string
  sourcePath: string | null
  itemCount: number
  lastSyncedAt: string | null
}

export interface CatalogReloadResult {
  ok: boolean
  itemCount: number
  sourcePath: string | null
  error?: string
}

export interface NewCatalogItemInput {
  sku: string
  description: string
  maker?: string
  family?: string
  series?: string
  listPrice?: number
  discountFactor?: number
  unitPrice?: number
  uom?: string
}

export interface ResolveUnmatchedLineResult {
  matched: boolean
  catalogItem: CatalogItem | null
}

export type FeedbackAction = 'accepted' | 'corrected' | 'flagged_for_later'

export interface FeedbackLogEntry {
  id: string
  quotationLineId: string | null
  flagId: string | null
  fieldChanged: string
  aiValue: string
  humanValue: string
  action: FeedbackAction
  note: string | null
  createdAt: string
}

export type EventLogLevel = 'error' | 'crash'

export interface EventLogEntry {
  id: string
  level: EventLogLevel
  source: string
  message: string
  errorCode: string | null
  context: string | null
  createdAt: string
}

export interface FeedbackResolveLineInput {
  lineId: string
  flagId: string | null
  action: FeedbackAction
  fields?: {
    description?: string
    qty?: number
    uom?: string
    tag?: string
  }
  note?: string
}

export type ExtractionStatus = 'running' | 'done' | 'error'
export type ExtractionFlagSeverity = 'info' | 'warning'

export interface AnnotationBoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ExtractedComponent {
  description: string
  qty: number
  uom: string
  tag: string
  pageNumber: number
  panelName: string
  /** The recognized component type this belongs to (e.g. "MCCB", "Contactor") — used to resolve a per-type preferred brand at match time. */
  componentType: string
  confidence: number
  notes: string
  boundingBox: AnnotationBoundingBox | null
}

export interface ExtractionFlag {
  pageNumber: number
  message: string
  severity: ExtractionFlagSeverity
  boundingBox: AnnotationBoundingBox | null
}

export interface Extraction {
  id: string
  sldId: string
  status: ExtractionStatus
  model: string | null
  components: ExtractedComponent[]
  flags: ExtractionFlag[]
  error: string | null
  inputTokens: number | null
  outputTokens: number | null
  createdAt: string
  completedAt: string | null
}

export interface ProjectTokenUsage {
  totalInputTokens: number
  totalOutputTokens: number
  extractionCount: number
}

export interface ExtractionProgressEvent {
  sldId: string
  pct: number
  stage: string
}

export interface UpdateStatus {
  currentVersion: string
  latestVersion: string
  isNewer: boolean
}

// Result of an on-demand update check (app:checkForUpdate IPC channel).
// succeeded is false when the check itself failed (offline, bad response) —
// status may still be non-null in that case if an earlier check (e.g. the
// launch-time one) had already populated the cache.
export interface UpdateCheckResult {
  status: UpdateStatus | null
  succeeded: boolean
}
