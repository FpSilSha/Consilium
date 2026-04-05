import { type ReactNode, useState, useCallback, useMemo, useRef } from 'react'
import type { Provider, ModelInfo } from '@/types'
import { useStore } from '@/store'
import { Tooltip } from '@/features/ui/Tooltip'
import { getModelsForProvider } from '@/features/modelSelector/model-registry'
import { getRawKey } from '@/features/keys/key-vault'
import { saveCatalogPreferences } from './catalog-persistence'
import { testModelId, testWillCost } from './model-validation'

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

      {/* Add custom model ID */}
      <CustomModelInput provider={provider} onAdded={toggleModel} />

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
          <Tooltip text="Pricing sourced from OpenRouter. Actual provider pricing may vary." position="bottom">
            <span
              role="img"
              aria-label="Pricing info"
              className="ml-1 inline-block cursor-help text-[8px]"
            >
              &#9432;
            </span>
          </Tooltip>
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
          <Tooltip text="Price override active" position="left">
            <span className="ml-0.5 text-accent-blue">*</span>
          </Tooltip>
        )}
      </span>
    </label>
  )
}

function CustomModelInput({ provider, onAdded }: {
  readonly provider: Provider
  readonly onAdded: (modelId: string) => void
}): ReactNode {
  const keys = useStore((s) => s.keys)
  const setCatalogModels = useStore((s) => s.setCatalogModels)
  const catalogModels = useStore((s) => s.catalogModels[provider]) ?? []

  const [customId, setCustomId] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [showCostWarning, setShowCostWarning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const willCost = testWillCost(provider)

  const doTest = useCallback(async () => {
    const trimmed = customId.trim()
    if (trimmed === '') return

    const key = keys.find((k) => k.provider === provider)
    if (key == null) {
      setTestResult('No API key for this provider')
      return
    }
    const rawKey = getRawKey(key.id)
    if (rawKey == null) {
      setTestResult('Key not accessible')
      return
    }

    // If it costs money, confirm first
    if (willCost && !showCostWarning) {
      setShowCostWarning(true)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setTesting(true)
    setTestResult(null)
    setShowCostWarning(false)

    const result = await testModelId(provider, trimmed, rawKey, controller.signal)
    setTesting(false)

    if (controller.signal.aborted) return

    if (result.valid) {
      setTestResult('Valid — model added')
      // Add to catalog so it appears in the list
      const newModel: ModelInfo = {
        id: trimmed,
        name: trimmed,
        provider,
        contextWindow: 0,
        inputPricePerToken: 0,
        outputPricePerToken: 0,
      }
      setCatalogModels(provider, [...catalogModels, newModel])
      onAdded(trimmed)
      setCustomId('')
    } else {
      setTestResult(result.error ?? 'Invalid model ID')
    }
  }, [customId, keys, provider, willCost, showCostWarning, catalogModels, setCatalogModels, onAdded])

  return (
    <div className="mb-2 rounded-md border border-edge-subtle bg-surface-base px-3 py-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={customId}
          onChange={(e) => { setCustomId(e.target.value); setTestResult(null); setShowCostWarning(false) }}
          placeholder="Custom model ID..."
          disabled={testing}
          className="flex-1 rounded-md border border-edge-subtle bg-surface-panel px-2 py-1 text-xs text-content-primary placeholder-content-disabled outline-none focus:border-edge-focus disabled:opacity-50"
          onKeyDown={(e) => { if (e.key === 'Enter') doTest() }}
        />
        <button
          onClick={doTest}
          disabled={testing || customId.trim() === ''}
          className="rounded-md bg-surface-hover px-2.5 py-1 text-[10px] font-medium text-content-muted transition-colors hover:bg-surface-active disabled:opacity-50"
        >
          {testing ? 'Testing...' : 'Test'}
        </button>
      </div>

      {showCostWarning && (
        <div className="mt-1.5 flex items-center gap-2 rounded-md bg-accent-red/10 px-2 py-1.5">
          <span className="text-[10px] text-content-muted">
            No free validation for {provider}. Testing will send a minimal API call that may incur cost.
          </span>
          <button
            onClick={doTest}
            className="shrink-0 rounded-md bg-accent-blue px-2 py-0.5 text-[10px] text-content-inverse transition-colors hover:bg-accent-blue/90"
          >
            Confirm
          </button>
          <button
            onClick={() => setShowCostWarning(false)}
            className="shrink-0 text-[10px] text-content-disabled hover:text-content-muted"
          >
            Cancel
          </button>
        </div>
      )}

      {testResult != null && (
        <p className={`mt-1 text-[10px] ${testResult.startsWith('Valid') ? 'text-success' : 'text-error'}`}>
          {testResult}
        </p>
      )}
    </div>
  )
}

function formatTokenPrice(pricePerToken: number): string {
  const perMillion = pricePerToken * 1_000_000
  if (perMillion >= 100) return perMillion.toFixed(0)
  if (perMillion >= 1) return perMillion.toFixed(2)
  if (perMillion >= 0.01) return perMillion.toFixed(4)
  return perMillion.toFixed(6)
}
