import type { ReactNode } from 'react'
import { useStore } from '@/store'

/**
 * Contextual guidance when the chat is empty.
 * Chains: no keys → add keys → no advisors → add advisor → ready to chat.
 */
export function EmptyStateGuide(): ReactNode {
  const keysLoaded = useStore((s) => s.keys.length)
  const advisorCount = useStore((s) => s.windowOrder.length)
  const setConfigModalOpen = useStore((s) => s.setConfigModalOpen)

  if (keysLoaded === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-content-muted">Add your API keys to get started.</p>
        <button
          onClick={() => setConfigModalOpen(true)}
          className="rounded-full bg-accent-blue px-4 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90"
        >
          Open Models & Keys
        </button>
      </div>
    )
  }

  if (advisorCount === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p className="text-sm text-content-muted">Add your first advisor in the panel on the right.</p>
        <p className="text-xs text-content-disabled">Each advisor uses its own persona, provider, and model.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2">
      <p className="text-sm text-content-muted">Type a message below to start the conversation.</p>
      <p className="text-xs text-content-disabled">Use @AgentName to direct a message to a specific advisor.</p>
    </div>
  )
}
