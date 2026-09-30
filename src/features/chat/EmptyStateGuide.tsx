import type { ReactNode } from 'react'
import { useStore } from '@/store'
import { useClaudeSubscriptionAvailability } from '@/features/modelSelector/use-claude-subscription'
import { emptyStateGuidance } from './empty-state-guidance'

/**
 * Contextual guidance when the chat is empty.
 * Chains: no API key or subscription → add one → no advisors → add advisor → ready to chat.
 */
export function EmptyStateGuide(): ReactNode {
  const hasKeys = useStore((s) => s.keys.length > 0)
  const advisorCount = useStore((s) => s.windowOrder.length)
  const setConfigModalOpen = useStore((s) => s.setConfigModalOpen)
  const subscription = useClaudeSubscriptionAvailability()

  const guidance = emptyStateGuidance({ hasKeys, subscription, advisorCount })
  if (guidance === null) return <div className="flex flex-1" />

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sm text-content-muted">{guidance.message}</p>
      {guidance.showModelsAndKeys && (
        <button
          onClick={() => setConfigModalOpen(true)}
          className="mt-1 rounded-full bg-accent-blue px-4 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90"
        >
          Open Models & Keys
        </button>
      )}
      {guidance.detail !== undefined && <p className="text-xs text-content-disabled">{guidance.detail}</p>}
      {guidance.hint !== undefined && <p className="mt-2 max-w-md text-xs text-accent-blue/80">{guidance.hint}</p>}
    </div>
  )
}
