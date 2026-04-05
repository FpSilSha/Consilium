import { type ReactNode, useCallback } from 'react'
import type { TurnMode } from '@/types'
import { Tooltip } from '@/features/ui/Tooltip'
import { useStore } from '@/store'
import { buildInitialQueue } from '@/features/turnManager/queue-builder'
import { startRun, stopAll, dispatchNextTurn } from '@/features/turnManager'

const MODES: readonly { readonly value: TurnMode; readonly label: string; readonly tooltip: string }[] = [
  { value: 'sequential', label: 'Seq', tooltip: 'Round-robin: each advisor responds in order' },
  { value: 'parallel', label: 'Par', tooltip: 'All advisors respond simultaneously' },
  { value: 'manual', label: 'Man', tooltip: 'Trigger each advisor individually' },
  { value: 'queue', label: 'Queue', tooltip: 'Custom drag-and-drop turn order' },
]

export function TurnControls(): ReactNode {
  const turnMode = useStore((s) => s.turnMode)
  const setTurnMode = useStore((s) => s.setTurnMode)
  const setQueue = useStore((s) => s.setQueue)
  const windowOrder = useStore((s) => s.windowOrder)
  const isRunning = useStore((s) => s.isRunning)
  const isPaused = useStore((s) => s.isPaused)
  const setPaused = useStore((s) => s.setPaused)
  const loopCount = useStore((s) => s.loopCount)
  const setLoopCount = useStore((s) => s.setLoopCount)
  const roundsCompleted = useStore((s) => s.roundsCompleted)
  const autoRetryTransient = useStore((s) => s.autoRetryTransient)
  const setAutoRetryTransient = useStore((s) => s.setAutoRetryTransient)

  const handleModeChange = useCallback((mode: TurnMode) => {
    setTurnMode(mode)
    const newQueue = buildInitialQueue(windowOrder, mode)
    setQueue(newQueue)
  }, [setTurnMode, setQueue, windowOrder])

  return (
    <div className="flex flex-col gap-2 px-3 pb-2">
      {/* Mode selector */}
      <div role="group" aria-label="Turn mode" className="flex gap-1">
        {MODES.map((mode) => (
          <Tooltip key={mode.value} text={mode.tooltip} position="bottom">
            <button
              onClick={() => handleModeChange(mode.value)}
              disabled={isRunning}
              aria-pressed={turnMode === mode.value}
              className={`flex-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                turnMode === mode.value
                  ? 'bg-accent-blue text-content-inverse'
                  : 'bg-surface-base text-content-muted hover:bg-surface-hover hover:text-content-primary'
              } disabled:opacity-50`}
            >
              {mode.label}
            </button>
          </Tooltip>
        ))}
      </div>

      {/* Loop counter */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-content-disabled">Rounds</label>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLoopCount(Math.max(0, loopCount - 1))}
            disabled={isRunning || loopCount === 0}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-base text-xs text-content-muted transition-colors hover:bg-surface-hover disabled:opacity-30"
          >
            −
          </button>
          <span className="w-8 text-center text-xs text-content-primary">
            {loopCount === 0 ? '∞' : loopCount}
          </span>
          <button
            onClick={() => setLoopCount(loopCount + 1)}
            disabled={isRunning}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-base text-xs text-content-muted transition-colors hover:bg-surface-hover disabled:opacity-30"
          >
            +
          </button>
        </div>
        {isRunning && loopCount > 0 && (
          <span className="text-[10px] text-content-disabled">
            {roundsCompleted}/{loopCount}
          </span>
        )}
        {isRunning && loopCount === 0 && roundsCompleted > 0 && (
          <span className="text-[10px] text-content-disabled">
            round {roundsCompleted}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5">
        {!isRunning ? (
          <button
            onClick={startRun}
            disabled={windowOrder.length === 0}
            className="flex-1 rounded-full bg-accent-green py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-green/90 disabled:opacity-40"
          >
            Start
          </button>
        ) : (
          <>
            {isPaused ? (
              <button
                onClick={() => { setPaused(false); dispatchNextTurn() }}
                className="flex-1 rounded-full bg-accent-green py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-green/90"
              >
                Resume
              </button>
            ) : (
              <button
                onClick={() => setPaused(true)}
                className="flex-1 rounded-full bg-surface-hover py-1.5 text-xs font-medium text-content-muted transition-colors hover:bg-surface-active"
              >
                Pause
              </button>
            )}
            <button
              onClick={stopAll}
              className="flex-1 rounded-full bg-accent-red py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-red/90"
            >
              Stop
            </button>
          </>
        )}
      </div>

      {/* Auto-retry toggle */}
      <label className="flex items-center gap-1.5 text-[10px] text-content-disabled">
        <input
          type="checkbox"
          checked={autoRetryTransient}
          onChange={(e) => setAutoRetryTransient(e.target.checked)}
          className="h-3 w-3 rounded border-edge-subtle accent-accent-blue"
        />
        Auto-retry on transient errors
      </label>

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
