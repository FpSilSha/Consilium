import { type ReactNode, useState } from 'react'
import type { AdvisorWindow } from '@/types'
import { useStore } from '@/store'
import { getModelsForProvider } from '@/features/modelSelector'
import { performPersonaSwitch } from '@/features/compaction'
import { WindowHeader } from './WindowHeader'

interface AdvisorPaneProps {
  readonly window: AdvisorWindow
  readonly onClose: () => void
  readonly children?: ReactNode
}

type PaneMode = 'normal' | 'confirmClose' | 'edit'

export function AdvisorPane({ window: win, onClose, children }: AdvisorPaneProps): ReactNode {
  const [mode, setMode] = useState<PaneMode>('normal')
  const [pendingPersonaId, setPendingPersonaId] = useState<string | null>(null)
  const [isSwitching, setIsSwitching] = useState(false)

  const updateWindow = useStore((s) => s.updateWindow)
  const personas = useStore((s) => s.personas)
  const models = getModelsForProvider(win.provider)

  const pendingPersona = pendingPersonaId != null
    ? personas.find((p) => p.id === pendingPersonaId)
    : undefined

  const handleClose = (): void => {
    if (mode === 'confirmClose') {
      onClose()
    } else {
      setMode('confirmClose')
    }
  }

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    setMode('confirmClose')
  }

  const handleDoubleClick = (): void => {
    if (mode !== 'confirmClose') {
      setMode('edit')
      setPendingPersonaId(null)
    }
  }

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    updateWindow(win.id, { model: e.target.value })
  }

  const handlePersonaSelect = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const newId = e.target.value
    if (newId !== win.personaId) {
      setPendingPersonaId(newId)
    }
  }

  const confirmPersonaSwitch = (): void => {
    if (pendingPersona != null) {
      setIsSwitching(true)
      performPersonaSwitch(win.id, pendingPersona)
        .catch(() => {
          updateWindow(win.id, { personaId: pendingPersona.id, personaLabel: pendingPersona.name })
        })
        .finally(() => {
          setIsSwitching(false)
          setPendingPersonaId(null)
        })
    }
  }

  return (
    <div
      className="flex h-full flex-col bg-gray-950"
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
    >
      <WindowHeader window={win} onClose={handleClose} />

      {mode === 'confirmClose' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
          <p className="text-sm text-gray-400">
            Remove this advisor? Their past messages remain in the shared context.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-500"
            >
              Remove
            </button>
            <button
              onClick={() => setMode('normal')}
              className="rounded bg-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'edit' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: win.accentColor }}
          />

          {/* Persona selector */}
          <div className="flex w-full max-w-xs flex-col gap-1">
            <label className="text-xs text-gray-500">Persona</label>
            <select
              value={pendingPersonaId ?? win.personaId}
              onChange={handlePersonaSelect}
              className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-300 outline-none focus:border-gray-500"
            >
              {personas.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Persona switch confirmation */}
          {pendingPersona != null && (
            <div className="w-full max-w-xs rounded border border-yellow-800 bg-yellow-950 p-2">
              <p className="text-xs text-yellow-300">
                Switch to {pendingPersona.name}? This will compact and reframe this advisor&apos;s context.
              </p>
              <div className="mt-2 flex gap-1.5">
                <button
                  onClick={confirmPersonaSwitch}
                  disabled={isSwitching}
                  className="rounded bg-yellow-700 px-2 py-0.5 text-xs text-white hover:bg-yellow-600 disabled:opacity-50"
                >
                  {isSwitching ? 'Switching...' : 'Switch'}
                </button>
                <button
                  onClick={() => setPendingPersonaId(null)}
                  className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Model selector */}
          <div className="flex w-full max-w-xs flex-col gap-1">
            <label className="text-xs text-gray-500">Model</label>
            <select
              value={win.model}
              onChange={handleModelChange}
              className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-300 outline-none focus:border-gray-500"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Info */}
          <div className="text-xs text-gray-600">
            Cost: ~${win.runningCost.toFixed(4)} · {win.isCompacted ? 'Compacted' : 'Full context'}
          </div>

          <button
            onClick={() => { setMode('normal'); setPendingPersonaId(null) }}
            className="rounded bg-gray-700 px-4 py-1.5 text-xs text-gray-300 hover:bg-gray-600"
          >
            Done
          </button>
        </div>
      )}

      {mode === 'normal' && (
        <div className="flex-1 overflow-hidden">
          {children ?? (
            <div className="flex h-full items-center justify-center text-sm text-gray-600">
              {win.error !== null ? (
                <span className="text-red-400">{win.error}</span>
              ) : (
                <span>Ready — {win.personaLabel}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
