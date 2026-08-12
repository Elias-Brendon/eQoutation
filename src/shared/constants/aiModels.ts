// Curated static list, not a live provider call — a live models.list() call
// would surface every historical/deprecated model with no signal about
// which are sensible for BOM extraction, and adds a startup network
// dependency for what's a 3-item choice that changes rarely.
export const AVAILABLE_AI_MODELS = [
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5 recommended (accuracy/cost balance)'
  },
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8 highest accuracy, slower/costlier'
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5 fastest/cheapest, lower accuracy'
  }
] as const

export const DEFAULT_AI_MODEL = 'claude-sonnet-5'
