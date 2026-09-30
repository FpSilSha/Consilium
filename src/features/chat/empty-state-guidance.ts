import type { SubscriptionAvailability } from '@/features/modelSelector/use-claude-subscription'

export interface EmptyStateGuidance {
  readonly message: string
  readonly detail?: string | undefined
  /** Show the "Open Models & Keys" button under the message. */
  readonly showModelsAndKeys: boolean
  /** A nudge toward whichever of API keys / subscription the user doesn't have yet. */
  readonly hint?: string | undefined
}

const SUBSCRIPTION_HOW_TO = 'install Claude Code, sign in, then choose "Claude subscription (Claude Code)" as an advisor\'s provider.'

/** New advisors default to an API-key provider, so a subscription-only user must switch it. */
const PICK_SUBSCRIPTION = 'then choose "Claude subscription (Claude Code)" as its provider.'

/**
 * What the empty chat should say. Chains: no way to reach a model → add an API
 * key or a subscription → no advisors → add one → ready to chat. Returns null
 * while the subscription check is still running and there are no API keys,
 * so the screen doesn't flash "add something" at a subscription-only user.
 */
export function emptyStateGuidance(input: {
  readonly hasKeys: boolean
  readonly subscription: SubscriptionAvailability
  readonly advisorCount: number
}): EmptyStateGuidance | null {
  const { hasKeys, subscription, advisorCount } = input
  const hasSubscription = subscription === 'available'

  if (!hasKeys && !hasSubscription) {
    if (subscription === 'checking') return null
    return {
      message: 'Add an API key for a service, or add your Claude subscription.',
      detail: `For your subscription: ${SUBSCRIPTION_HOW_TO}`,
      showModelsAndKeys: true,
    }
  }

  const hint = hasKeys && subscription === 'unavailable'
    ? `You can use your personal Claude subscription for yourself! To add it, ${SUBSCRIPTION_HOW_TO}`
    : !hasKeys && hasSubscription
      ? 'You can also add an API key for another service in Models & Keys.'
      : undefined

  if (advisorCount === 0) {
    return {
      message: hasKeys
        ? 'Add your first advisor in the panel on the right.'
        : `Add your first advisor in the panel on the right, ${PICK_SUBSCRIPTION}`,
      detail: 'Each advisor uses its own persona, provider, and model.',
      showModelsAndKeys: false,
      hint,
    }
  }

  return {
    message: 'Type a message below to start the conversation.',
    detail: 'Use @AgentName to direct a message to a specific advisor.',
    showModelsAndKeys: false,
    hint,
  }
}

/**
 * The advisor panel's line when it has no advisors yet; null (show nothing)
 * while the subscription check runs and there are no API keys, matching the chat.
 */
export function emptyAdvisorListText(hasKeys: boolean, subscription: SubscriptionAvailability): string | null {
  if (!hasKeys && subscription === 'checking') return null
  if (!hasKeys && subscription === 'unavailable') return 'Add an API key or your Claude subscription first.'
  return hasKeys
    ? 'No advisors yet. Click "+ Add Advisor" above.'
    : `No advisors yet. Click "+ Add Advisor" above, ${PICK_SUBSCRIPTION}`
}
