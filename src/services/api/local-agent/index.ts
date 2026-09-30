import type { LocalAgentReadiness } from '../../../../shared/local-agent/protocol'
import { useStore } from '@/store'
import { getSessionGeneration } from '@/features/sessions/session-manager'
import type { LocalAgentBridge, LocalAgentClientDeps } from './client'

export { streamLocalAgent } from './client'
export type { LocalAgentBridge, LocalAgentClientDeps, SessionSnapshot } from './client'

/** The provider value for advisors that run on the user's own Claude subscription. */
export const CLAUDE_SUBSCRIPTION_PROVIDER = 'claude-subscription' as const

type BridgeWithReadiness = LocalAgentBridge & {
  localAgentReadiness(runtime: 'claude-code'): Promise<LocalAgentReadiness>
}

function getBridge(): BridgeWithReadiness | null {
  const api = (globalThis as { consiliumAPI?: Partial<BridgeWithReadiness> }).consiliumAPI
  return api !== undefined
    && typeof api.localAgentStart === 'function'
    && typeof api.localAgentCancel === 'function'
    && typeof api.onLocalAgentEvent === 'function'
    && typeof api.localAgentReadiness === 'function'
    ? (api as BridgeWithReadiness)
    : null
}

export function defaultLocalAgentDeps(): LocalAgentClientDeps {
  return {
    bridge: getBridge(),
    captureSession: () => ({ sessionId: useStore.getState().currentSessionId, generation: getSessionGeneration() }),
    newRequestId: () => crypto.randomUUID(),
  }
}

/** Whether Claude Code is installed and signed in with a Claude subscription. */
export async function getClaudeSubscriptionReadiness(): Promise<LocalAgentReadiness> {
  const bridge = getBridge()
  if (bridge === null) return { state: 'error', message: 'Claude subscription advisors need the Consilium desktop app' }
  try {
    return await bridge.localAgentReadiness('claude-code')
  } catch {
    return { state: 'error', message: 'Could not check Claude Code' }
  }
}
