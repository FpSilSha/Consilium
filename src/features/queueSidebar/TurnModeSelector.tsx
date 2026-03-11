import type { ReactNode } from 'react'
import type { TurnMode } from '@/types'
import { useStore } from '@/store'

const MODES: readonly { readonly value: TurnMode; readonly label: string }[] = [
  { value: 'sequential', label: 'Seq' },
  { value: 'parallel', label: 'Par' },
  { value: 'manual', label: 'Man' },
  { value: 'queue', label: 'Queue' },
]

export function TurnModeSelector(): ReactNode {
  const turnMode = useStore((s) => s.turnMode)
  const setTurnMode = useStore((s) => s.setTurnMode)
  const isRunning = useStore((s) => s.isRunning)

  return (
    <div className="flex gap-1">
      {MODES.map((mode) => (
        <button
          key={mode.value}
          onClick={() => setTurnMode(mode.value)}
          disabled={isRunning}
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
            turnMode === mode.value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          } disabled:opacity-50`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  )
}
