import type { ReactNode } from 'react'
import type { QueueCard as QueueCardType } from '@/types'
import { useStore } from '@/store'

interface QueueCardProps {
  readonly card: QueueCardType
  readonly personaLabel: string
  readonly model: string
  readonly accentColor: string
  readonly onManualTrigger: () => void
  readonly onSkip: () => void
  readonly onUnskip: () => void
  readonly onDuplicate: () => void
  readonly onRemove: () => void
  readonly isDragTarget?: boolean | undefined
}

export function QueueCardItem({
  card,
  personaLabel,
  model,
  accentColor,
  onManualTrigger,
  onSkip,
  onUnskip,
  onDuplicate,
  onRemove,
  isDragTarget,
}: QueueCardProps): ReactNode {
  const turnMode = useStore((s) => s.turnMode)

  const isActive = card.status === 'active'
  const isErrored = card.status === 'errored'
  const isCompleted = card.status === 'completed'
  const isSkipped = card.status === 'skipped'
  const isWaiting = card.status === 'waiting'

  const borderColor = isActive
    ? accentColor
    : isErrored
      ? '#ef4444'
      : isCompleted
        ? '#22c55e'
        : isSkipped
          ? '#6b7280'
          : '#374151'

  const bgClass = isDragTarget
    ? 'bg-gray-700'
    : isActive
      ? 'bg-gray-800'
      : 'bg-gray-900'

  return (
    <div
      className={`${bgClass} relative rounded-lg border-l-4 px-3 py-2 transition-colors`}
      style={{ borderLeftColor: borderColor }}
      draggable={isWaiting && turnMode !== 'parallel'}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', card.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      {isActive && (
        <div
          className="absolute inset-0 animate-pulse rounded-lg border opacity-30"
          style={{ borderColor: accentColor }}
        />
      )}

      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {card.isUser ? (
              <span className="text-sm font-medium text-blue-400">You</span>
            ) : (
              <span className="text-sm font-medium text-gray-200">{personaLabel}</span>
            )}
            {isActive && (
              <span className="text-xs text-yellow-400">thinking...</span>
            )}
            {isCompleted && (
              <span className="text-xs text-green-400">done</span>
            )}
            {isErrored && (
              <span className="text-xs text-red-400">{card.errorLabel ?? 'error'}</span>
            )}
            {isSkipped && (
              <span className="text-xs text-gray-500">skipped</span>
            )}
          </div>
          {!card.isUser && (
            <div className="text-xs text-gray-500">{model}</div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {turnMode === 'manual' && isWaiting && !card.isUser && (
            <button
              onClick={onManualTrigger}
              className="rounded px-1.5 py-0.5 text-xs text-blue-400 hover:bg-gray-700"
              title="Trigger this agent"
            >
              Go
            </button>
          )}
          {isWaiting && turnMode !== 'parallel' && (
            <>
              <button
                onClick={onSkip}
                className="rounded px-1 py-0.5 text-xs text-gray-500 hover:text-gray-300"
                title="Skip to end of queue"
              >
                Skip
              </button>
              <button
                onClick={onDuplicate}
                className="rounded px-1 py-0.5 text-xs text-gray-500 hover:text-gray-300"
                title="Duplicate card"
              >
                +
              </button>
            </>
          )}
          {isSkipped && (
            <button
              onClick={onUnskip}
              className="rounded px-1 py-0.5 text-xs text-blue-400 hover:text-blue-300"
              title="Restore to queue"
            >
              Unskip
            </button>
          )}
          {!isActive && (
            <button
              onClick={onRemove}
              className="rounded px-1 py-0.5 text-xs text-gray-600 hover:text-red-400"
              title="Remove from queue"
            >
              x
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
