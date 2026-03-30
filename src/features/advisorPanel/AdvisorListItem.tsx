import { type ReactNode, useState, useCallback } from 'react'
import type { AdvisorWindow } from '@/types'
import { useStore } from '@/store'
import { getModelById, getModelsForProvider } from '@/features/modelSelector/model-registry'

interface AdvisorListItemProps {
  readonly advisor: AdvisorWindow
}

export function AdvisorListItem({ advisor }: AdvisorListItemProps): ReactNode {
  const updateWindow = useStore((s) => s.updateWindow)
  const removeWindow = useStore((s) => s.removeWindow)
  const personas = useStore((s) => s.personas)
  const openRouterModels = useStore((s) => s.openRouterModels)

  const [editing, setEditing] = useState(false)

  const modelName = getModelById(advisor.model, openRouterModels)?.name ?? advisor.model
  const models = advisor.provider === 'openrouter'
    ? openRouterModels
    : getModelsForProvider(advisor.provider)

  const handleModelChange = useCallback((modelId: string) => {
    updateWindow(advisor.id, { model: modelId })
  }, [advisor.id, updateWindow])

  const handlePersonaChange = useCallback((personaId: string) => {
    const persona = personas.find((p) => p.id === personaId)
    if (persona == null) return
    updateWindow(advisor.id, { personaId: persona.id, personaLabel: persona.name })
  }, [advisor.id, personas, updateWindow])

  if (editing) {
    return (
      <div className="rounded-lg border border-edge-subtle bg-surface-base px-3 py-2.5">
        {/* Persona select */}
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-disabled">
          Persona
        </label>
        <select
          value={advisor.personaId}
          onChange={(e) => handlePersonaChange(e.target.value)}
          className="mb-2 w-full rounded-md border border-edge-subtle bg-surface-panel px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
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
            className="mb-2 w-full rounded-md border border-edge-subtle bg-surface-panel px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
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
            className="mb-2 w-full rounded-md border border-edge-subtle bg-surface-panel px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
          />
        )}

        <button
          onClick={() => setEditing(false)}
          className="w-full rounded-md bg-surface-hover py-1 text-xs text-content-muted transition-colors hover:bg-surface-active"
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
