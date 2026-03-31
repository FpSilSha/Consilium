import { type ReactNode, useState, useCallback, useMemo } from 'react'
import type { Provider, ModelInfo } from '@/types'
import { useStore } from '@/store'
import { getModelsForProvider } from '@/features/modelSelector/model-registry'
import { saveCatalogPreferences } from './catalog-persistence'

interface ModelCheckboxListProps {
  readonly provider: Provider
}

export function ModelCheckboxList({ provider }: ModelCheckboxListProps): ReactNode {
  const catalogModels = useStore((s) => s.catalogModels[provider]) ?? []
  const allowedIds = useStore((s) => s.allowedModels[provider]) ?? []
  const setAllowedModels = useStore((s) => s.setAllowedModels)
  const catalogStatus = useStore((s) => s.catalogStatus[provider])
  const priceOverrides = useStore((s) => s.priceOverrides)

  const [search, setSearch] = useState('')

  const allModels = catalogModels.length > 0
    ? catalogModels
    : getModelsForProvider(provider)

  const filteredModels = useMemo(() => {
    if (search.trim() === '') return allModels
    const q = search.toLowerCase()
    return allModels.filter((m) =>
      m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
    )
  }, [allModels, search])

  // Empty allowedIds = no curation, all models available, checkboxes unchecked
  const isCurated = allowedIds.length > 0

  const isModelChecked = useCallback((modelId: string) => {
    if (!isCurated) return false // uncurated = all unchecked visually
    return allowedIds.includes(modelId)
  }, [isCurated, allowedIds])

  const persistAllowed = useCallback((newAllowed: readonly string[]) => {
    setAllowedModels(provider, newAllowed)
    const state = useStore.getState()
    const updatedAllowed = { ...state.allowedModels, [provider]: newAllowed }
    saveCatalogPreferences(updatedAllowed, state.priceOverrides).catch(() => {})
  }, [provider, setAllowedModels])

  const toggleModel = useCallback((modelId: string) => {
    const currentAllowed = useStore.getState().allowedModels[provider] ?? []
    const currentlyCurated = currentAllowed.length > 0

    let newAllowed: readonly string[]
    if (!currentlyCurated) {
      // First check starts curation with just this model
      newAllowed = [modelId]
    } else if (currentAllowed.includes(modelId)) {
      // Unchecking — if empty, revert to uncurated (all available)
      newAllowed = currentAllowed.filter((id) => id !== modelId)
    } else {
      newAllowed = [...currentAllowed, modelId]
    }

    persistAllowed(newAllowed)
  }, [provider, persistAllowed])

  const clearCuration = useCallback(() => {
    persistAllowed([])
  }, [persistAllowed])

  if (allModels.length === 0) {
    return (
      <div className="rounded-md bg-surface-base px-4 py-6 text-center text-xs text-content-disabled">
        {catalogStatus === 'loading' ? 'Loading models...' :
         catalogStatus === 'error' ? 'Failed to load models. Add an API key to fetch the model list.' :
         'No models available. Add an API key to fetch the model list.'}
      </div>
    )
  }

  return (
    <div>
      {/* Curation status banner */}
      <div className="mb-2 flex items-center justify-between rounded-md bg-surface-base px-3 py-2">
        {isCurated ? (
          <>
            <span className="text-xs text-content-muted">
              {allowedIds.length} model{allowedIds.length !== 1 ? 's' : ''} selected — only these will appear in advisor dropdowns
            </span>
            <button
              onClick={clearCuration}
              className="text-xs text-accent-blue transition-colors hover:text-accent-blue/80"
            >
              Clear selection
            </button>
          </>
        ) : (
          <span className="text-xs text-content-disabled">
            All models available. Check models below to curate a list.
          </span>
        )}
      </div>

      {/* Search */}
      <div className="mb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search models..."
          className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary placeholder-content-disabled outline-none focus:border-edge-focus"
        />
      </div>

      {/* Table header */}
      <div className="mb-1 flex items-center gap-2 px-2 text-[10px] font-medium uppercase tracking-wider text-content-disabled">
        <span className="w-6" />
        <span className="flex-1">Model</span>
        <span className="w-16 text-right">Context</span>
        <span className="w-24 text-right">
          Pricing
          <span
            role="img"
            aria-label="Pricing sourced from OpenRouter. Actual provider pricing may vary."
            title="Pricing sourced from OpenRouter. Actual provider pricing may vary."
            className="ml-1 inline-block cursor-help text-[8px]"
          >
            &#9432;
          </span>
        </span>
      </div>

      {/* Model list */}
      <div className="max-h-64 overflow-y-auto rounded-md border border-edge-subtle bg-surface-base">
        {filteredModels.map((m) => (
          <ModelRow
            key={m.id}
            model={m}
            checked={isModelChecked(m.id)}
            onToggle={() => toggleModel(m.id)}
            priceOverride={priceOverrides[m.id]}
          />
        ))}
        {filteredModels.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-content-disabled">
            No models match "{search}"
          </p>
        )}
      </div>
    </div>
  )
}

function ModelRow({ model, checked, onToggle, priceOverride }: {
  readonly model: ModelInfo
  readonly checked: boolean
  readonly onToggle: () => void
  readonly priceOverride?: { readonly input: number; readonly output: number } | undefined
}): ReactNode {
  const inputPrice = priceOverride?.input ?? model.inputPricePerToken
  const outputPrice = priceOverride?.output ?? model.outputPricePerToken

  return (
    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors hover:bg-surface-hover">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-3.5 w-3.5 rounded border-edge-subtle accent-accent-blue"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-content-primary">{model.name}</div>
        <div className="truncate text-[10px] text-content-disabled">{model.id}</div>
      </div>
      <span className="w-16 text-right text-[10px] text-content-disabled">
        {model.contextWindow > 0 ? `${Math.round(model.contextWindow / 1000)}K` : '—'}
      </span>
      <span className="w-24 text-right text-[10px] text-content-disabled">
        {inputPrice > 0 || outputPrice > 0
          ? `$${formatTokenPrice(inputPrice)} / $${formatTokenPrice(outputPrice)}`
          : '—'}
        {priceOverride != null && (
          <span className="ml-0.5 text-accent-blue" title="Price override active">*</span>
        )}
      </span>
    </label>
  )
}

function formatTokenPrice(pricePerToken: number): string {
  const perMillion = pricePerToken * 1_000_000
  if (perMillion >= 100) return perMillion.toFixed(0)
  if (perMillion >= 1) return perMillion.toFixed(2)
  if (perMillion >= 0.01) return perMillion.toFixed(4)
  return perMillion.toFixed(6)
}
