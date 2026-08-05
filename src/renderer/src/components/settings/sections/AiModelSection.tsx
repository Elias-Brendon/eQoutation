import { useSettings, useUpdateSettings } from '@renderer/state/queries/useSettings'
import { Input } from '@renderer/components/common/Input'
import { AVAILABLE_AI_MODELS } from '@shared/constants/aiModels'
import type { AppSettings } from '@shared/types/entities'

export function AiModelSection(): React.JSX.Element {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">AI Model</h3>
        <p className="mt-1 text-xs text-text-secondary">
          Which AI provider and model run BOM extraction, and how uncertain results are handled.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-text-secondary">Provider</label>
        <select
          value={settings?.aiProvider ?? 'anthropic'}
          onChange={(e) =>
            updateSettings.mutate({ aiProvider: e.target.value as AppSettings['aiProvider'] })
          }
          className="h-9 w-full max-w-96 rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai-compatible">OpenAI-compatible (OpenAI, Qwen, Grok, local, …)</option>
        </select>
      </div>

      {settings?.aiProvider === 'openai-compatible' ? (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
              Base URL
            </label>
            <Input
              value={settings.openaiCompatibleBaseUrl}
              onChange={(e) => updateSettings.mutate({ openaiCompatibleBaseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="max-w-96"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-text-secondary">Model</label>
            <Input
              value={settings.openaiCompatibleModel}
              onChange={(e) => updateSettings.mutate({ openaiCompatibleModel: e.target.value })}
              placeholder="gpt-5, qwen-vl-max, …"
              className="max-w-96"
            />
          </div>
        </>
      ) : (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-text-secondary">Model</label>
          <select
            value={settings?.aiModel ?? ''}
            onChange={(e) => updateSettings.mutate({ aiModel: e.target.value })}
            className="h-9 w-full max-w-96 rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            {(settings?.cachedAiModels ?? AVAILABLE_AI_MODELS).map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
          Confidence threshold ({((settings?.confidenceThreshold ?? 0.7) * 100).toFixed(0)}%)
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings?.confidenceThreshold ?? 0.7}
          onChange={(e) => updateSettings.mutate({ confidenceThreshold: Number(e.target.value) })}
          className="w-full max-w-96 accent-accent"
        />
        <p className="mt-1 text-xs text-text-muted">
          Extracted lines below this confidence get flagged for review.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
          Max retries on failure
        </label>
        <select
          value={settings?.maxExtractionRetries ?? 0}
          onChange={(e) =>
            updateSettings.mutate({ maxExtractionRetries: Number(e.target.value) })
          }
          className="h-9 w-24 rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          {[0, 1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-text-muted">
          Automatically retries a failed extraction call this many extra times before giving up.
        </p>
      </div>
    </div>
  )
}
