import type { ReactNode } from 'react'
import type { QueueCard as QueueCardType } from '@/types'
import { useStore } from '@/store'
import { resolveModelById } from '@/features/modelSelector'

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

  const modelInfo = resolveModelById(model)
  const modelDisplay = modelInfo?.name ?? model

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
      className={`${bgClass} relative rounded border-l-2 px-2 py-1.5 transition-colors`}
      style={{ borderLeftColor: borderColor }}
      draggable={isWaiting && turnMode !== 'parallel'}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', card.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      {isActive && (
        <div
          className="absolute inset-0 animate-pulse rounded border opacity-30"
          style={{ borderColor: accentColor }}
        />
      )}

      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {card.isUser ? (
              <span className="text-xs font-medium text-blue-400">You</span>
            ) : (
              <span className="truncate text-xs font-medium text-gray-200">{personaLabel}</span>
            )}
            {isActive && (
              <span className="shrink-0 text-[10px] text-yellow-400">thinking...</span>
            )}
            {isCompleted && (
              <span className="shrink-0 text-[10px] text-green-400">done</span>
            )}
            {isErrored && (
              <span className="shrink-0 text-[10px] text-red-400">{card.errorLabel ?? 'error'}</span>
            )}
            {isSkipped && (
              <span className="shrink-0 text-[10px] text-gray-500">skipped</span>
            )}
          </div>
          {!card.isUser && (
            <div className="truncate text-[10px] text-gray-500">{modelDisplay}</div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {turnMode === 'manual' && isWaiting && !card.isUser && (
            <button
              onClick={onManualTrigger}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-400 hover:bg-gray-700"
              title="Trigger this agent"
            >
              Go
            </button>
          )}
          {isWaiting && turnMode !== 'parallel' && (
            <>
              <button
                onClick={onSkip}
                className="rounded px-1 py-0.5 text-[10px] text-gray-500 hover:text-gray-300"
                title="Skip to end of queue"
              >
                Skip
              </button>
              <button
                onClick={onDuplicate}
                className="rounded px-0.5 py-0.5 text-[10px] text-gray-500 hover:text-gray-300"
                title="Duplicate card"
              >
                +
              </button>
            </>
          )}
          {isSkipped && (
            <button
              onClick={onUnskip}
              className="rounded px-1 py-0.5 text-[10px] text-blue-400 hover:text-blue-300"
              title="Restore to queue"
            >
              Unskip
            </button>
          )}
          {!isActive && (
            <button
              onClick={onRemove}
              className="rounded px-0.5 py-0.5 text-[10px] text-gray-600 hover:text-red-400"
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
