import { type ReactNode, useCallback } from 'react'
import type { TurnMode } from '@/types'
import { useStore } from '@/store'
import { buildInitialQueue } from '@/features/turnManager/queue-builder'
import { startRun, stopAll } from '@/features/turnManager'

const MODES: readonly { readonly value: TurnMode; readonly label: string }[] = [
  { value: 'sequential', label: 'Seq' },
  { value: 'parallel', label: 'Par' },
  { value: 'manual', label: 'Man' },
  { value: 'queue', label: 'Queue' },
]

export function TurnControls(): ReactNode {
  const turnMode = useStore((s) => s.turnMode)
  const setTurnMode = useStore((s) => s.setTurnMode)
  const setQueue = useStore((s) => s.setQueue)
  const windowOrder = useStore((s) => s.windowOrder)
  const isRunning = useStore((s) => s.isRunning)
  const isPaused = useStore((s) => s.isPaused)
  const setPaused = useStore((s) => s.setPaused)
  const resetQueue = useStore((s) => s.resetQueue)
  const queueLength = useStore((s) => s.queue.length)

  const handleModeChange = useCallback((mode: TurnMode) => {
    setTurnMode(mode)
    const newQueue = buildInitialQueue(windowOrder, mode)
    setQueue(newQueue)
  }, [setTurnMode, setQueue, windowOrder])

  return (
    <div className="flex flex-col gap-3 border-b border-edge-subtle px-3 py-3">
      {/* Mode selector */}
      <div role="group" aria-label="Turn mode" className="flex gap-1">
        {MODES.map((mode) => (
          <button
            key={mode.value}
            onClick={() => handleModeChange(mode.value)}
            disabled={isRunning}
            aria-pressed={turnMode === mode.value}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              turnMode === mode.value
                ? 'bg-accent-blue text-content-inverse'
                : 'bg-surface-hover text-content-muted hover:bg-surface-active hover:text-content-primary'
            } disabled:opacity-50`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5">
        {!isRunning ? (
          <>
            <button
              onClick={startRun}
              className="flex-1 rounded-md bg-accent-green py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-green/90"
            >
              Start
            </button>
            {queueLength > 0 && (
              <button
                onClick={resetQueue}
                className="rounded-md bg-surface-hover px-3 py-1.5 text-xs text-content-muted transition-colors hover:bg-surface-active"
              >
                Reset
              </button>
            )}
          </>
        ) : (
          <>
            {isPaused ? (
              <button
                onClick={() => setPaused(false)}
                className="flex-1 rounded-md bg-accent-green py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-green/90"
              >
                Resume
              </button>
            ) : (
              <button
                onClick={() => setPaused(true)}
                className="flex-1 rounded-md bg-surface-hover py-1.5 text-xs font-medium text-content-muted transition-colors hover:bg-surface-active"
              >
                Pause
              </button>
            )}
            <button
              onClick={stopAll}
              className="flex-1 rounded-md bg-accent-red py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-red/90"
            >
              Stop
            </button>
          </>
        )}
      </div>

      {/* Mode hint */}
      <p className="text-xs text-content-disabled">
        {turnMode === 'sequential' && 'Round-robin: User → Agents → User'}
        {turnMode === 'parallel' && 'All agents respond simultaneously'}
        {turnMode === 'manual' && 'Click "Go" to trigger an agent'}
        {turnMode === 'queue' && 'Drag to reorder agent turns'}
      </p>
    </div>
  )
}
