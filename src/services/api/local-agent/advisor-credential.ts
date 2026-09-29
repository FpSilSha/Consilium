import type { ApiKey } from '@/types'

export type AdvisorCredential =
  | {
      readonly kind: 'api-key'
      readonly apiKey: string
      readonly baseUrl?: string | undefined
      readonly adapterDefinitionId?: string | undefined
    }
  /** Authenticated by the user's own Claude Code login; Consilium holds no key. */
  | { readonly kind: 'subscription' }
  | { readonly kind: 'missing-key' }
  | { readonly kind: 'unreadable-key' }

/**
 * Decides how an advisor authenticates. Only the exact `claude-subscription`
 * provider skips the key lookup; an empty key ID on any other provider is
 * still a missing key, never an implied subscription.
 */
export function resolveAdvisorCredential(
  advisor: { readonly provider: string; readonly keyId: string },
  keys: readonly ApiKey[],
  readKey: (keyId: string) => string | null,
): AdvisorCredential {
  if (advisor.provider === 'claude-subscription') return { kind: 'subscription' }
  const key = keys.find((k) => k.id === advisor.keyId)
  if (key === undefined) return { kind: 'missing-key' }
  const apiKey = readKey(key.id)
  if (apiKey === null) return { kind: 'unreadable-key' }
  return {
    kind: 'api-key',
    apiKey,
    ...(key.baseUrl != null ? { baseUrl: key.baseUrl } : {}),
    ...(key.adapterDefinitionId != null ? { adapterDefinitionId: key.adapterDefinitionId } : {}),
  }
}

/** Request fields for a usable credential. Subscription requests carry no key. */
export function credentialRequestFields(
  credential: Extract<AdvisorCredential, { kind: 'api-key' | 'subscription' }>,
): { readonly apiKey: string; readonly baseUrl?: string; readonly adapterDefinitionId?: string } {
  if (credential.kind === 'subscription') return { apiKey: '' }
  return {
    apiKey: credential.apiKey,
    ...(credential.baseUrl != null ? { baseUrl: credential.baseUrl } : {}),
    ...(credential.adapterDefinitionId != null ? { adapterDefinitionId: credential.adapterDefinitionId } : {}),
  }
}
