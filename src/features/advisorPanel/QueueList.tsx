import { type ReactNode, useCallback, useState } from 'react'
import { useStore } from '@/store'
import { Tooltip } from '@/features/ui/Tooltip'
import { getDisplayLabel } from '@/features/windows/display-labels'
import {
  getActiveQueueCards,
  getErroredCards,
  manualDispatch,
  createUserCard,
  createAgentCard,
} from '@/features/turnManager'

/**
 * Queue card list with drag-drop reordering, status indicators,
 * and per-card actions (skip, duplicate, remove, manual trigger).
 *
 * In sequential/parallel modes, renders a compact read-only turn order.
 * In manual/queue modes, renders the full interactive card list.
 */
export function QueueList(): ReactNode {
  const queue = useStore((s) => s.queue)
  const windows = useStore((s) => s.windows)
  const windowOrder = useStore((s) => s.windowOrder)
  const turnMode = useStore((s) => s.turnMode)
  const isRunning = useStore((s) => s.isRunning)
  const skipCard = useStore((s) => s.skipCard)
  const unskipCard = useStore((s) => s.unskipCard)
  const duplicateCard = useStore((s) => s.duplicateCard)
  const removeFromQueue = useStore((s) => s.removeFromQueue)
  const moveInQueue = useStore((s) => s.moveInQueue)
  const addToQueue = useStore((s) => s.addToQueue)

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const activeCards = getActiveQueueCards(queue)
  const erroredCards = getErroredCards(queue)
  const hasUserCard = queue.some((c) => c.isUser)

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault()
      const cardId = e.dataTransfer.getData('text/plain')
      if (cardId !== '') moveInQueue(cardId, toIndex)
      setDragOverIndex(null)
    },
    [moveInQueue],
  )

  const getCardInfo = useCallback(
    (windowId: string, isUser: boolean) => {
      if (isUser) return { label: 'You', color: '#007BFF', model: '' }
      const win = windows[windowId]
      return {
        label: getDisplayLabel(windowId, windowOrder, windows),
        color: win?.accentColor ?? '#6b7280',
        model: win?.model ?? '',
      }
    },
    [windows, windowOrder],
  )

  const isReadOnly = turnMode === 'sequential'

  // ── Read-only view for Sequential / Parallel ────────────────
  if (isReadOnly) {
    return (
      <div className="flex flex-col">
        {/* Add all advisors — respects advisor panel order */}
        {!isRunning && activeCards.length === 0 && Object.keys(windows).length > 0 && (
          <div className="border-b border-edge-subtle px-3 py-2">
            <button
              onClick={() => {
                addToQueue(createUserCard())
                for (const windowId of windowOrder) {
                  addToQueue(createAgentCard(windowId))
                }
              }}
              className="w-full rounded-md bg-surface-hover px-2 py-1 text-xs text-content-muted transition-colors hover:bg-surface-active"
            >
              + All Advisors
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {activeCards.length === 0 && (
            <p className="py-4 text-center text-xs text-content-disabled">
              No advisors in queue.
            </p>
          )}
          <div className="flex flex-col gap-1">
            {activeCards.map((card, index) => {
              const { label, color, model } = getCardInfo(card.windowId, card.isUser)
              const isActive = card.status === 'active'
              const isCompleted = card.status === 'completed'

              return (
                <div
                  key={card.id}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                    isActive ? 'bg-surface-hover' : 'bg-surface-base'
                  }`}
                >
                  {/* Turn number */}
                  <span className="w-4 shrink-0 text-right text-[10px] text-content-disabled">
                    {index + 1}
                  </span>

                  {/* Color dot */}
                  <div
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? 'animate-pulse' : ''}`}
                    style={{ backgroundColor: color }}
                  />

                  {/* Label + model */}
                  <div className="min-w-0 flex-1">
                    <span className={`truncate text-xs font-medium ${card.isUser ? 'text-accent-blue' : 'text-content-primary'}`}>
                      {label}
                    </span>
                    {model !== '' && (
                      <span className="ml-1.5 truncate text-[10px] text-content-disabled">
                        {model.split('/').pop()}
                      </span>
                    )}
                  </div>

                  {/* Status */}
                  {isActive && <span className="text-[10px] text-accent-green">thinking...</span>}
                  {isCompleted && <span className="text-[10px] text-success">done</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Errored cards — still shown in read-only mode */}
        <ErroredCardList erroredCards={erroredCards} getCardInfo={getCardInfo} removeFromQueue={removeFromQueue} />
      </div>
    )
  }

  // ── Full interactive view for Manual / Queue ────────────────
  return (
    <div className="flex flex-col">
      {/* Quick add buttons */}
      {!isRunning && (
        <div className="flex gap-1.5 border-b border-edge-subtle px-3 py-2">
          {!hasUserCard && (
            <button
              onClick={() => addToQueue(createUserCard())}
              className="flex-1 rounded-md bg-surface-hover px-2 py-1 text-xs text-accent-blue transition-colors hover:bg-surface-active"
            >
              + Your Turn
            </button>
          )}
          {Object.keys(windows).length > 0 && (
            <button
              onClick={() => {
                for (const windowId of Object.keys(windows)) {
                  const alreadyQueued = queue.some(
                    (c) => c.windowId === windowId && c.status === 'waiting',
                  )
                  if (!alreadyQueued) addToQueue(createAgentCard(windowId))
                }
              }}
              className="flex-1 rounded-md bg-surface-hover px-2 py-1 text-xs text-content-muted transition-colors hover:bg-surface-active"
            >
              + All Advisors
            </button>
          )}
        </div>
      )}

      {/* Active queue */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {activeCards.length === 0 && (
          <p className="py-4 text-center text-xs text-content-disabled">
            Queue empty. Add turns above.
          </p>
        )}
        <div className="flex flex-col gap-1">
          {activeCards.map((card, index) => {
            const { label, color, model } = getCardInfo(card.windowId, card.isUser)
            const isActive = card.status === 'active'
            const isWaiting = card.status === 'waiting'
            const isCompleted = card.status === 'completed'
            const isSkipped = card.status === 'skipped'
            const canDrag = isWaiting && turnMode === 'queue'

            return (
              <div
                key={card.id}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragLeave={() => setDragOverIndex(null)}
              >
                <div
                  className={`flex items-center gap-2 rounded-md border-l-2 px-2 py-1.5 transition-colors ${
                    dragOverIndex === index ? 'bg-surface-active' : isActive ? 'bg-surface-hover' : 'bg-surface-base'
                  }`}
                  style={{ borderLeftColor: color, borderLeftStyle: isSkipped ? 'dashed' : 'solid' }}
                  draggable={canDrag}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', card.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                >
                  {/* Drag handle — queue mode only */}
                  {turnMode === 'queue' && isWaiting && (
                    <span className="cursor-grab text-[10px] text-content-disabled">⠿</span>
                  )}

                  {/* Color dot */}
                  <div
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? 'animate-pulse' : ''}`}
                    style={{ backgroundColor: isSkipped ? '#4A5568' : color }}
                  />

                  {/* Label + model + status */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`truncate text-xs font-medium ${card.isUser ? 'text-accent-blue' : 'text-content-primary'}`}>
                        {label}
                      </span>
                      {model !== '' && (
                        <span className="truncate text-[10px] text-content-disabled">
                          {model.split('/').pop()}
                        </span>
                      )}
                    </div>
                    {isActive && <span className="text-[10px] text-accent-green">thinking...</span>}
                    {isCompleted && <span className="text-[10px] text-success">done</span>}
                    {isSkipped && <span className="text-[10px] text-content-disabled">skipped</span>}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-0.5">
                    {turnMode === 'manual' && isWaiting && !card.isUser && (
                      <button
                        onClick={() => manualDispatch(card.id)}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-accent-blue hover:bg-surface-hover"
                      >
                        Go
                      </button>
                    )}
                    {isWaiting && (
                      <>
                        <Tooltip text="Skip this turn" position="top">
                          <button
                            onClick={() => skipCard(card.id)}
                            className="rounded px-1 py-0.5 text-[10px] text-content-disabled hover:text-content-muted"
                          >
                            Skip
                          </button>
                        </Tooltip>
                        <Tooltip text="Duplicate this turn" position="top">
                          <button
                            onClick={() => duplicateCard(card.id)}
                            className="rounded px-0.5 py-0.5 text-[10px] text-content-disabled hover:text-content-muted"
                          >
                            +
                          </button>
                        </Tooltip>
                      </>
                    )}
                    {isSkipped && (
                      <button
                        onClick={() => unskipCard(card.id)}
                        className="rounded px-1 py-0.5 text-[10px] text-accent-blue hover:text-accent-blue/80"
                      >
                        Unskip
                      </button>
                    )}
                    {!isActive && (
                      <Tooltip text="Remove from queue" position="top">
                        <button
                          onClick={() => removeFromQueue(card.id)}
                          className="rounded px-0.5 py-0.5 text-[10px] text-content-disabled hover:text-accent-red"
                        >
                          ✕
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Errored cards */}
      <ErroredCardList erroredCards={erroredCards} getCardInfo={getCardInfo} removeFromQueue={removeFromQueue} />
    </div>
  )
}

/** Shared errored cards section used in both views */
function ErroredCardList({ erroredCards, getCardInfo, removeFromQueue }: {
  readonly erroredCards: readonly { readonly id: string; readonly windowId: string; readonly isUser: boolean; readonly errorLabel: string | null }[]
  readonly getCardInfo: (windowId: string, isUser: boolean) => { readonly label: string; readonly color: string; readonly model: string }
  readonly removeFromQueue: (cardId: string) => void
}): ReactNode {
  if (erroredCards.length === 0) return null

  return (
    <div className="border-t border-error/30 px-2 py-2">
      <div className="mb-1.5 text-xs font-medium text-error">Errored</div>
      <div className="flex flex-col gap-1">
        {erroredCards.map((card) => {
          const { label, color } = getCardInfo(card.windowId, card.isUser)
          return (
            <div
              key={card.id}
              className="flex items-center gap-2 rounded-md border-l-2 border-l-error bg-surface-base px-2 py-1.5"
            >
              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="min-w-0 flex-1 truncate text-xs text-content-muted">{label}</span>
              <span className="text-[10px] text-error">{card.errorLabel ?? 'error'}</span>
              <button
                onClick={() => removeFromQueue(card.id)}
                className="text-[10px] text-content-disabled hover:text-accent-red"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
