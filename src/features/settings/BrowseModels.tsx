import { type ReactNode, useState, useMemo } from 'react'
import type { Provider } from '@/types'
import { useStore } from '@/store'
import { SearchableModelSelect } from '@/features/modelCatalog/SearchableModelSelect'
import { useFilteredModels } from '@/features/modelCatalog/use-filtered-models'
import { formatProviderLabel } from '@/features/modelCatalog/format-provider-label'

/**
 * Shared "Browse models" picker used by both CompileSettingsPane and
 * AutoCompactionSettingsPane to let the user pick any provider+model
 * combination from their configured API keys.
 *
 * Originally lived as a duplicated component in each settings pane.
 * Hoisted here when the coherency review noted the duplication —
 * both copies were structurally identical (provider dropdown +
 * SearchableModelSelect for the chosen provider's models, plus a
 * Back button to return to the parent pane).
 *
 * The two callers differ slightly in their "Use this model"
 * commitment style:
 *
 *   - immediate: AutoCompactionSettingsPane wires the model select's
 *     onChange directly to onSelect, so picking a model commits
 *     immediately. The picker disappears after the user picks.
 *
 *   - confirm: CompileSettingsPane has the user pick a model THEN
 *     click a separate "Use this model" button to commit. The picker
 *     stays open while the user reviews their choice.
 *
 * Both modes are supported via the `commitStyle` prop. Defaults to
 * 'confirm' (the more cautious of the two).
 *
 * The empty-keys case is handled here too — both original copies had
 * a slightly different empty state. Now standardized: a clear
 * "No API keys configured" message with a Back button.
 */

interface BrowseModelsProps {
  readonly onSelect: (provider: string, model: string, keyId: string) => void
  readonly onBack: () => void
  readonly commitStyle?: 'immediate' | 'confirm'
}

export function BrowseModels({
  onSelect,
  onBack,
  commitStyle = 'confirm',
}: BrowseModelsProps): ReactNode {
  const keys = useStore((s) => s.keys)

  const providersWithKeys = useMemo(() => {
    const map = new Map<Provider, { keyId: string; label: string }>()
    for (const key of keys) {
      const provider = key.provider as Provider
      if (!map.has(provider)) {
        map.set(provider, { keyId: key.id, label: formatProviderLabel(provider) })
      }
    }
    return Array.from(map.entries()).map(([provider, info]) => ({ provider, ...info }))
  }, [keys])

  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    providersWithKeys[0]?.provider ?? null,
  )

  if (providersWithKeys.length === 0) {
    return (
      <div className="rounded-md border border-edge-subtle p-3">
        <p className="text-xs text-content-disabled">
          No API keys configured. Add a key in Models &amp; Keys first.
        </p>
        <button
          onClick={onBack}
          className="mt-2 text-xs text-accent-blue underline hover:text-accent-blue/80"
        >
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-edge-subtle p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-medium text-content-muted">Browse models</p>
        <button
          onClick={onBack}
          className="text-[10px] text-content-muted hover:text-content-primary"
        >
          ← Back
        </button>
      </div>

      <label className="mb-1 block text-[10px] text-content-muted">Provider</label>
      <select
        value={selectedProvider ?? ''}
        onChange={(e) => setSelectedProvider(e.target.value as Provider)}
        className="mb-2 w-full rounded-md border border-edge-subtle bg-surface-base px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
      >
        {providersWithKeys.map((p) => (
          <option key={p.provider} value={p.provider}>
            {p.label}
          </option>
        ))}
      </select>

      {selectedProvider != null && (
        <BrowseModelsList
          provider={selectedProvider}
          keyId={providersWithKeys.find((p) => p.provider === selectedProvider)?.keyId ?? ''}
          onSelect={onSelect}
          commitStyle={commitStyle}
        />
      )}
    </div>
  )
}

function BrowseModelsList({
  provider,
  keyId,
  onSelect,
  commitStyle,
}: {
  readonly provider: Provider
  readonly keyId: string
  readonly onSelect: (provider: string, model: string, keyId: string) => void
  readonly commitStyle: 'immediate' | 'confirm'
}): ReactNode {
  const models = useFilteredModels(provider)
  const [selectedModelId, setSelectedModelId] = useState('')

  if (models.length === 0) {
    return (
      <p className="text-[10px] text-content-disabled">
        No models available for this provider. Configure allowed models in Models &amp; Keys.
      </p>
    )
  }

  if (commitStyle === 'immediate') {
    return (
      <>
        <label className="mb-1 block text-[10px] text-content-muted">Model</label>
        <SearchableModelSelect
          models={models}
          value=""
          onChange={(modelId) => onSelect(provider, modelId, keyId)}
        />
      </>
    )
  }

  // confirm mode — separate "Use this model" button
  return (
    <>
      <label className="mb-1 block text-[10px] text-content-muted">Model</label>
      <SearchableModelSelect
        models={models}
        value={selectedModelId}
        onChange={setSelectedModelId}
      />
      <button
        onClick={() => {
          if (selectedModelId === '') return
          onSelect(provider, selectedModelId, keyId)
        }}
        disabled={selectedModelId === ''}
        className="mt-2 w-full rounded-md bg-accent-blue px-2 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90 disabled:opacity-50"
      >
        Use this model
      </button>
    </>
  )
}
