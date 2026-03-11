import { type ReactNode, useState } from 'react'
import type { AdvisorWindow } from '@/types'
import { WindowHeader } from './WindowHeader'

interface AdvisorPaneProps {
  readonly window: AdvisorWindow
  readonly onClose: () => void
  readonly children?: ReactNode
}

export function AdvisorPane({ window: win, onClose, children }: AdvisorPaneProps): ReactNode {
  const [confirmClose, setConfirmClose] = useState(false)

  const handleClose = (): void => {
    if (confirmClose) {
      onClose()
    } else {
      setConfirmClose(true)
    }
  }

  const handleCancelClose = (): void => {
    setConfirmClose(false)
  }

  return (
    <div className="flex h-full flex-col bg-gray-950">
      <WindowHeader window={win} onClose={handleClose} />

      {confirmClose ? (
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
              onClick={handleCancelClose}
              className="rounded bg-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
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
