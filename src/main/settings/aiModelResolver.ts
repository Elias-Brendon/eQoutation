// After a successful "Test connection", the freshly-fetched model list
// replaces the cached one. If the currently-selected model isn't in that
// list (e.g. the new key doesn't have access to it, or it's been retired),
// fall back to the newest available model (Anthropic returns models
// newest-first) rather than silently leaving extraction pointed at a model
// the current key can't use.
export function resolveAiModelForModelList(
  currentAiModel: string,
  models: { id: string; label: string }[]
): string {
  if (models.some((m) => m.id === currentAiModel)) return currentAiModel
  return models[0]?.id ?? currentAiModel
}
