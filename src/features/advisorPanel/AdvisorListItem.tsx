import { type ReactNode, useState, useCallback } from 'react'
import type { AdvisorWindow, Provider } from '@/types'
import { useStore } from '@/store'
import { Tooltip } from '@/features/ui/Tooltip'
import { getModelById } from '@/features/modelSelector/model-registry'
import { useFilteredModels } from '@/features/modelCatalog/use-filtered-models'
import { SearchableModelSelect } from '@/features/modelCatalog/SearchableModelSelect'
import { performPersonaSwitch } from '@/features/compaction'
import { retryAdvisor } from '@/features/turnManager'
import { getDisplayLabel } from '@/features/windows/display-labels'
import { PersonaPreview } from './PersonaPreview'

const PROVIDERS: readonly { readonly value: Provider; readonly label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
  { value: 'xai', label: 'xAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'custom', label: 'Custom' },
]

interface AdvisorListItemProps {
  readonly advisor: AdvisorWindow
}

export function AdvisorListItem({ advisor }: AdvisorListItemProps): ReactNode {
  const updateWindow = useStore((s) => s.updateWindow)
  const removeWindow = useStore((s) => s.removeWindow)
  const personas = useStore((s) => s.personas)
  const keys = useStore((s) => s.keys)
  const orModels = useStore((s) => s.catalogModels['openrouter']) ?? []
  const messageCount = useStore((s) => s.messages.length)

  const [editing, setEditing] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<Provider>(advisor.provider)
  const [pendingPersonaId, setPendingPersonaId] = useState<string | null>(null)
  const [isSwitching, setIsSwitching] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const modelName = getModelById(advisor.model, orModels)?.name ?? advisor.model
  const windowOrder = useStore((s) => s.windowOrder)
  const windows = useStore((s) => s.windows)
  const displayLabel = getDisplayLabel(advisor.id, windowOrder, windows)
  const models = useFilteredModels(selectedProvider)

  const pendingPersona = pendingPersonaId !== null
    ? personas.find((p) => p.id === pendingPersonaId)
    : undefined

  const handleProviderChange = useCallback((newProvider: Provider) => {
    setSelectedProvider(newProvider)

    // Find a key for this provider
    const key = keys.find((k) => k.provider === newProvider)

    // Pick first available model for the new provider
    const state = useStore.getState()
    const catalog = state.catalogModels[newProvider] ?? []
    const allowed = state.allowedModels[newProvider] ?? []
    const available = allowed.length > 0
      ? catalog.filter((m) => allowed.includes(m.id))
      : catalog

    const firstModel = available[0]?.id ?? ''

    updateWindow(advisor.id, {
      provider: newProvider,
      keyId: key?.id ?? '',
      model: firstModel,
    })
  }, [advisor.id, keys, updateWindow])

  const handleModelChange = useCallback((modelId: string) => {
    updateWindow(advisor.id, { model: modelId })
  }, [advisor.id, updateWindow])

  const handlePersonaSelect = useCallback((personaId: string) => {
    if (personaId === advisor.personaId) return

    if (messageCount > 0) {
      setPendingPersonaId(personaId)
    } else {
      const persona = personas.find((p) => p.id === personaId)
      if (persona != null) {
        updateWindow(advisor.id, { personaId: persona.id, personaLabel: persona.name })
      }
    }
  }, [advisor.id, advisor.personaId, messageCount, personas, updateWindow])

  const confirmPersonaSwitch = useCallback(async () => {
    if (pendingPersona == null) return
    setIsSwitching(true)
    try {
      await performPersonaSwitch(advisor.id, pendingPersona)
    } catch {
      updateWindow(advisor.id, {
        personaId: pendingPersona.id,
        personaLabel: pendingPersona.name,
      })
    } finally {
      setIsSwitching(false)
      setPendingPersonaId(null)
    }
  }, [advisor.id, pendingPersona, updateWindow])

  const cancelPersonaSwitch = useCallback(() => {
    setPendingPersonaId(null)
  }, [])

  if (editing) {
    return (
      <div className="rounded-lg border border-edge-subtle bg-surface-base px-3 py-2.5">
        {/* Persona switch confirmation */}
        {pendingPersona != null && !isSwitching && (
          <div className="mb-2 rounded-md border border-accent-red/30 bg-accent-red/10 px-2.5 py-2">
            <p className="text-xs text-content-primary">
              Switch to <strong>{pendingPersona.name}</strong>?
            </p>
            <p className="mt-0.5 text-[10px] text-content-muted">
              This will compact and reframe this advisor's context for the new persona.
            </p>
            <div className="mt-1.5 flex gap-1.5">
              <button
                onClick={confirmPersonaSwitch}
                className="rounded-full bg-accent-blue px-3 py-0.5 text-[10px] font-medium text-content-inverse transition-colors hover:bg-accent-blue/90"
              >
                Switch
              </button>
              <button
                onClick={cancelPersonaSwitch}
                className="rounded-full bg-surface-hover px-3 py-0.5 text-[10px] text-content-muted transition-colors hover:bg-surface-active"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isSwitching && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-accent-blue/30 bg-accent-blue/10 px-2.5 py-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-blue" />
            <span className="text-[10px] text-content-muted">
              Compacting context for persona switch...
            </span>
          </div>
        )}

        {/* Persona select */}
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[10px] font-medium uppercase tracking-wider text-content-disabled">
            Persona
          </label>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="text-[10px] text-content-muted transition-colors hover:text-content-primary"
          >
            {showPreview ? 'Hide' : 'Preview'}
          </button>
        </div>
        <select
          value={pendingPersonaId ?? advisor.personaId}
          onChange={(e) => { handlePersonaSelect(e.target.value); setShowPreview(false) }}
          disabled={isSwitching}
          className="mb-2 w-full rounded-md border border-edge-subtle bg-surface-panel px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus disabled:opacity-50"
        >
          {personas.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {showPreview && (() => {
          const previewPersona = personas.find((p) => p.id === (pendingPersonaId ?? advisor.personaId))
          return previewPersona != null
            ? <PersonaPreview persona={previewPersona} onClose={() => setShowPreview(false)} />
            : null
        })()}

        {/* Provider select */}
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-disabled">
          Provider
        </label>
        <select
          value={selectedProvider}
          onChange={(e) => handleProviderChange(e.target.value as Provider)}
          disabled={isSwitching}
          className="mb-2 w-full rounded-md border border-edge-subtle bg-surface-panel px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus disabled:opacity-50"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>

        {/* Model select */}
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-disabled">
          Model
        </label>
        {models.length > 0 ? (
          <SearchableModelSelect
            models={models}
            value={advisor.model}
            onChange={handleModelChange}
            disabled={isSwitching}
          />
        ) : (
          <p className="mb-2 text-[10px] text-content-disabled">
            No models available. Add models via Models & Keys in the sidebar.
          </p>
        )}

        <button
          onClick={() => { setEditing(false); setPendingPersonaId(null) }}
          disabled={isSwitching}
          className="w-full rounded-md bg-surface-hover py-1 text-xs text-content-muted transition-colors hover:bg-surface-active disabled:opacity-50"
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-surface-hover">
      <div
        className={`h-3 w-3 shrink-0 rounded-full ${advisor.isStreaming ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: advisor.accentColor }}
      />

      <Tooltip text="Edit persona, provider, and model" position="left">
        <button
          onClick={() => { setEditing(true); setSelectedProvider(advisor.provider) }}
          disabled={advisor.isStreaming}
          className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
        >
        <div className="truncate text-sm font-medium text-content-primary">
          {displayLabel}
        </div>
        <div className="truncate text-xs text-content-muted">
          {modelName}
        </div>
        {advisor.runningCost > 0 && (
          <div className="text-xs text-content-disabled">
            ~${advisor.runningCost.toFixed(4)}
          </div>
        )}
        </button>
      </Tooltip>

      <div className="flex shrink-0 items-center gap-1">
        {advisor.isStreaming && (
          <span className="text-xs text-accent-green">typing</span>
        )}
        {advisor.error != null && !advisor.isStreaming && (
          <ErrorActions
            advisorId={advisor.id}
            advisorLabel={advisor.personaLabel}
            accentColor={advisor.accentColor}
            errorMessage={advisor.error}
            provider={advisor.provider}
            model={advisor.model}
          />
        )}
      </div>

      <Tooltip text="Remove advisor" position="left">
        <button
          onClick={() => removeWindow(advisor.id)}
          className="shrink-0 rounded p-0.5 text-xs text-content-disabled opacity-0 transition-opacity hover:text-accent-red group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
        >
          ✕
        </button>
      </Tooltip>
    </div>
  )
}

/** Extracted to avoid non-null assertion on advisor.error in click handler closure */
function ErrorActions({ advisorId, advisorLabel, accentColor, errorMessage, provider, model }: {
  readonly advisorId: string
  readonly advisorLabel: string
  readonly accentColor: string
  readonly errorMessage: string
  readonly provider: string
  readonly model: string
}): ReactNode {
  return (
    <>
      <Tooltip text="Retry this advisor" position="left">
        <button
          onClick={() => retryAdvisor(advisorId)}
          className="text-xs text-accent-blue transition-colors hover:text-accent-blue/80"
        >
          retry
        </button>
      </Tooltip>
      <Tooltip text="View error details" position="left">
        <button
          onClick={() => {
            useStore.getState().addErrorLog({
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              advisorLabel,
              accentColor,
              message: errorMessage,
              provider,
              model,
            })
          }}
          className="text-xs text-error transition-colors hover:text-accent-red"
        >
          err
        </button>
      </Tooltip>
    </>
  )
}
