import { type ReactNode, useState, useCallback } from 'react'
import type { AdvisorWindow } from '@/types'
import { useStore } from '@/store'
import { getModelById } from '@/features/modelSelector/model-registry'
import { useFilteredModels } from '@/features/modelCatalog/use-filtered-models'
import { performPersonaSwitch } from '@/features/compaction'

interface AdvisorListItemProps {
  readonly advisor: AdvisorWindow
}

export function AdvisorListItem({ advisor }: AdvisorListItemProps): ReactNode {
  const updateWindow = useStore((s) => s.updateWindow)
  const removeWindow = useStore((s) => s.removeWindow)
  const personas = useStore((s) => s.personas)
  const openRouterModels = useStore((s) => s.openRouterModels)
  const messageCount = useStore((s) => s.messages.length)

  const [editing, setEditing] = useState(false)
  const [pendingPersonaId, setPendingPersonaId] = useState<string | null>(null)
  const [isSwitching, setIsSwitching] = useState(false)

  const modelName = getModelById(advisor.model, openRouterModels)?.name ?? advisor.model
  const models = useFilteredModels(advisor.provider)

  const pendingPersona = pendingPersonaId !== null
    ? personas.find((p) => p.id === pendingPersonaId)
    : undefined

  const handleModelChange = useCallback((modelId: string) => {
    updateWindow(advisor.id, { model: modelId })
  }, [advisor.id, updateWindow])

  const handlePersonaSelect = useCallback((personaId: string) => {
    if (personaId === advisor.personaId) return

    // If there are messages, show confirmation — switching will compact context
    if (messageCount > 0) {
      setPendingPersonaId(personaId)
    } else {
      // No messages yet — safe to switch directly
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
      // Fallback: just update the persona without compaction
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
        {/* Persona switch confirmation warning */}
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

        {/* Switching in progress */}
        {isSwitching && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-accent-blue/30 bg-accent-blue/10 px-2.5 py-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-blue" />
            <span className="text-[10px] text-content-muted">
              Compacting context for persona switch...
            </span>
          </div>
        )}

        {/* Persona select */}
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-disabled">
          Persona
        </label>
        <select
          value={pendingPersonaId ?? advisor.personaId}
          onChange={(e) => handlePersonaSelect(e.target.value)}
          disabled={isSwitching}
          className="mb-2 w-full rounded-md border border-edge-subtle bg-surface-panel px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus disabled:opacity-50"
        >
          {personas.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {/* Model select */}
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-disabled">
          Model
        </label>
        {models.length > 0 ? (
          <select
            value={advisor.model}
            onChange={(e) => handleModelChange(e.target.value)}
            disabled={isSwitching}
            className="mb-2 w-full rounded-md border border-edge-subtle bg-surface-panel px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus disabled:opacity-50"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={advisor.model}
            onChange={(e) => handleModelChange(e.target.value)}
            placeholder="e.g. anthropic/claude-sonnet-4"
            disabled={isSwitching}
            className="mb-2 w-full rounded-md border border-edge-subtle bg-surface-panel px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus disabled:opacity-50"
          />
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
      {/* Color dot */}
      <div
        className={`h-3 w-3 shrink-0 rounded-full ${advisor.isStreaming ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: advisor.accentColor }}
      />

      {/* Info — click to edit */}
      <button
        onClick={() => setEditing(true)}
        disabled={advisor.isStreaming}
        className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
        title="Click to edit persona and model"
      >
        <div className="truncate text-sm font-medium text-content-primary">
          {advisor.personaLabel}
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

      {/* Status badges */}
      <div className="flex shrink-0 items-center gap-1">
        {advisor.isStreaming && (
          <span className="text-xs text-accent-green">typing</span>
        )}
        {advisor.error != null && (
          <span className="text-xs text-error" title={advisor.error}>err</span>
        )}
      </div>

      {/* Remove button */}
      <button
        onClick={() => removeWindow(advisor.id)}
        className="shrink-0 rounded p-0.5 text-xs text-content-disabled opacity-0 transition-opacity hover:text-accent-red group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
        title="Remove advisor"
      >
        ✕
      </button>
    </div>
  )
}
