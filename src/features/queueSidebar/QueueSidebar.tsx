import { type ReactNode, useCallback, useState } from 'react'
import { useStore } from '@/store'
import { getActiveQueueCards, getErroredCards, stopAll, startRun, manualDispatch, createUserCard, createAgentCard } from '@/features/turnManager'
import { QueueCardItem } from './QueueCard'
import { TurnModeSelector } from './TurnModeSelector'

export function QueueSidebar(): ReactNode {
  const queue = useStore((s) => s.queue)
  const windows = useStore((s) => s.windows)
  const turnMode = useStore((s) => s.turnMode)
  const isRunning = useStore((s) => s.isRunning)
  const isPaused = useStore((s) => s.isPaused)
  const skipCard = useStore((s) => s.skipCard)
  const unskipCard = useStore((s) => s.unskipCard)
  const duplicateCard = useStore((s) => s.duplicateCard)
  const removeFromQueue = useStore((s) => s.removeFromQueue)
  const moveInQueue = useStore((s) => s.moveInQueue)
  const setPaused = useStore((s) => s.setPaused)
  const resetQueue = useStore((s) => s.resetQueue)
  const addToQueue = useStore((s) => s.addToQueue)

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const hasUserCard = queue.some((c) => c.isUser)

  const activeCards = getActiveQueueCards(queue)
  const erroredCards = getErroredCards(queue)

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault()
      const cardId = e.dataTransfer.getData('text/plain')
      if (cardId !== '') {
        moveInQueue(cardId, toIndex)
      }
      setDragOverIndex(null)
    },
    [moveInQueue],
  )

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  const getCardDisplayProps = useCallback(
    (windowId: string, isUser: boolean) => {
      if (isUser) {
        return { personaLabel: 'You', model: '', accentColor: '#3b82f6' }
      }
      const win = windows[windowId]
      return {
        personaLabel: win?.personaLabel ?? 'Unknown',
        model: win?.model ?? '',
        accentColor: win?.accentColor ?? '#6b7280',
      }
    },
    [windows],
  )

  return (
    <div className="flex h-full w-56 flex-col border-l border-gray-800 bg-gray-950">
      <div className="flex flex-col gap-2 border-b border-gray-800 px-3 py-2">
        <span className="text-xs font-medium text-gray-400">Queue Type</span>
        <TurnModeSelector />
      </div>

      {/* Control buttons */}
      <div className="flex gap-1 border-b border-gray-800 px-3 py-2">
        {!isRunning ? (
          <button
            onClick={startRun}
            className="flex-1 rounded bg-green-700 px-2 py-1 text-xs font-medium text-white hover:bg-green-600"
          >
            Start
          </button>
        ) : (
          <>
            {isPaused ? (
              <button
                onClick={() => setPaused(false)}
                className="flex-1 rounded bg-green-700 px-2 py-1 text-xs font-medium text-white hover:bg-green-600"
              >
                Resume
              </button>
            ) : (
              <button
                onClick={() => setPaused(true)}
                className="flex-1 rounded bg-yellow-700 px-2 py-1 text-xs font-medium text-white hover:bg-yellow-600"
              >
                Pause
              </button>
            )}
            <button
              onClick={stopAll}
              className="flex-1 rounded bg-red-700 px-2 py-1 text-xs font-medium text-white hover:bg-red-600"
            >
              Stop All
            </button>
          </>
        )}
        {!isRunning && queue.length > 0 && (
          <button
            onClick={resetQueue}
            className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 hover:bg-gray-700"
          >
            Reset
          </button>
        )}
      </div>

      {/* Quick add buttons */}
      {!isRunning && (
        <div className="flex flex-col gap-1 border-b border-gray-800 px-3 py-1.5">
          {!hasUserCard && (
            <button
              onClick={() => addToQueue(createUserCard())}
              className="w-full rounded bg-gray-800 px-2 py-1 text-xs text-blue-400 hover:bg-gray-700 hover:text-blue-300"
            >
              + Your Turn
            </button>
          )}
          {Object.keys(windows).length > 0 && (
            <button
              onClick={() => {
                for (const windowId of Object.keys(windows)) {
                  const alreadyQueued = queue.some((c) => c.windowId === windowId && c.status === 'waiting')
                  if (!alreadyQueued) {
                    addToQueue(createAgentCard(windowId))
                  }
                }
              }}
              className="w-full rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-300"
            >
              + All Advisors
            </button>
          )}
        </div>
      )}

      {/* Active queue */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="flex flex-col gap-1.5">
          {activeCards.map((card, index) => {
            const { personaLabel, model, accentColor } = getCardDisplayProps(card.windowId, card.isUser)
            return (
              <div
                key={card.id}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragLeave={handleDragLeave}
              >
                <QueueCardItem
                  card={card}
                  personaLabel={personaLabel}
                  model={model}
                  accentColor={accentColor}
                  onManualTrigger={() => manualDispatch(card.id)}
                  onSkip={() => skipCard(card.id)}
                  onUnskip={() => unskipCard(card.id)}
                  onDuplicate={() => duplicateCard(card.id)}
                  onRemove={() => removeFromQueue(card.id)}
                  isDragTarget={dragOverIndex === index}
                />
              </div>
            )
          })}
        </div>

        {activeCards.length === 0 && (
          <div className="py-8 text-center text-xs text-gray-600">
            No agents in queue.
            <br />
            Click + on an advisor window to add them.
          </div>
        )}
      </div>

      {/* Errored zone */}
      {erroredCards.length > 0 && (
        <div className="border-t border-red-900 px-2 py-2">
          <div className="mb-1.5 text-xs font-medium text-red-400">Errored</div>
          <div className="flex flex-col gap-1.5">
            {erroredCards.map((card) => {
              const { personaLabel, model, accentColor } = getCardDisplayProps(card.windowId, card.isUser)
              return (
                <QueueCardItem
                  key={card.id}
                  card={card}
                  personaLabel={personaLabel}
                  model={model}
                  accentColor={accentColor}
                  onManualTrigger={() => {}}
                  onSkip={() => {}}
                  onUnskip={() => {}}
                  onDuplicate={() => {}}
                  onRemove={() => removeFromQueue(card.id)}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Mode hint */}
      <div className="border-t border-gray-800 px-3 py-1.5">
        <span className="text-xs text-gray-600">
          {turnMode === 'sequential' && 'Round-robin: User \u2192 Agents \u2192 User'}
          {turnMode === 'parallel' && 'All agents respond simultaneously'}
          {turnMode === 'manual' && 'Click "Go" to trigger an agent'}
          {turnMode === 'queue' && 'Drag cards to reorder'}
        </span>
      </div>
    </div>
  )
}
