import { type ReactNode, useState } from 'react'
import type { AdvisorWindow } from '@/types'
import { useStore } from '@/store'
import { CompactButton, performPersonaSwitch } from '@/features/compaction'
import { getModelsForProvider } from '@/features/modelSelector'
import { createAgentCard } from '@/features/turnManager'

interface WindowHeaderProps {
  readonly window: AdvisorWindow
  readonly onClose: () => void
}

export function WindowHeader({ window: win, onClose }: WindowHeaderProps): ReactNode {
  const updateWindow = useStore((s) => s.updateWindow)
  const addToQueue = useStore((s) => s.addToQueue)
  const personas = useStore((s) => s.personas)

  const [pendingPersonaId, setPendingPersonaId] = useState<string | null>(null)
  const [isSwitching, setIsSwitching] = useState(false)
  const pendingPersona = pendingPersonaId != null
    ? personas.find((p) => p.id === pendingPersonaId)
    : undefined

  const models = getModelsForProvider(win.provider)

  const handlePersonaSelect = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const newId = e.target.value
    if (newId !== win.personaId) {
      setPendingPersonaId(newId)
    }
  }

  const confirmPersonaChange = (): void => {
    if (pendingPersona != null) {
      setIsSwitching(true)
      performPersonaSwitch(win.id, pendingPersona)
        .catch(() => {
          // Fallback: at minimum update the label even if compaction fails
          updateWindow(win.id, { personaId: pendingPersona.id, personaLabel: pendingPersona.name })
        })
        .finally(() => { setIsSwitching(false) })
    }
    setPendingPersonaId(null)
  }

  const cancelPersonaChange = (): void => {
    setPendingPersonaId(null)
  }

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    updateWindow(win.id, { model: e.target.value })
  }

  const handleAddToQueue = (): void => {
    addToQueue(createAgentCard(win.id))
  }

  return (
    <div className="shrink-0">
      <div
        className="flex h-9 items-center justify-between border-b border-gray-800 px-3"
        style={{ borderTopColor: win.accentColor, borderTopWidth: 2 }}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: win.accentColor }}
          />
          <select
            value={pendingPersonaId ?? win.personaId}
            onChange={handlePersonaSelect}
            className="truncate rounded border-transparent bg-transparent text-xs font-medium text-gray-300 outline-none hover:border-gray-700 hover:bg-gray-800 focus:border-gray-500 focus:bg-gray-800"
            title="Change persona"
          >
            {personas.map((p) => (
              <option key={p.id} value={p.id} className="bg-gray-900">
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={win.model}
            onChange={handleModelChange}
            className="truncate rounded border-transparent bg-transparent text-xs text-gray-500 outline-none hover:border-gray-700 hover:bg-gray-800 focus:border-gray-500 focus:bg-gray-800"
            title="Change model"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id} className="bg-gray-900">
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAddToQueue}
            className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-700 hover:text-gray-300"
            title="Add to queue"
          >
            +
          </button>
          <CompactButton windowId={win.id} />
          <span className="text-xs text-gray-500">
            ~${win.runningCost.toFixed(4)}
          </span>
          {win.isStreaming && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
          )}
          <button
            onClick={onClose}
            className="ml-1 flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-700 hover:text-gray-300"
            title="Remove advisor"
          >
            x
          </button>
        </div>
      </div>

      {/* Persona change confirmation bar */}
      {pendingPersona != null && (
        <div className="flex items-center justify-between border-b border-yellow-800 bg-yellow-950 px-3 py-1.5">
          <span className="text-xs text-yellow-300">
            Switch to {pendingPersona.name}? This will compact and reframe this advisor&apos;s context.
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={confirmPersonaChange}
              className="rounded bg-yellow-700 px-2 py-0.5 text-xs text-white hover:bg-yellow-600"
            >
              Switch
            </button>
            <button
              onClick={cancelPersonaChange}
              className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {isSwitching && (
        <div className="flex items-center gap-2 border-b border-blue-800 bg-blue-950 px-3 py-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
          <span className="text-xs text-blue-300">Compacting context for persona switch...</span>
        </div>
      )}
    </div>
  )
}
