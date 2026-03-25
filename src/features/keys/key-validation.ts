import type { Provider } from '@/types'

export type ValidationFailureReason = 'auth_failure' | 'cancelled' | 'network_error' | 'unexpected_status'

export interface ValidationResult {
  readonly valid: boolean
  readonly reason?: ValidationFailureReason | undefined
  readonly error?: string | undefined
}

const PROVIDER_ENDPOINTS: Readonly<Record<Provider, string>> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/models',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
  xai: 'https://api.x.ai/v1/models',
  deepseek: 'https://api.deepseek.com/v1/models',
}

const VALIDATION_TIMEOUT_MS = 15_000

export async function validateKey(
  rawKey: string,
  provider: Provider,
  signal?: AbortSignal,
): Promise<ValidationResult> {
  const endpoint = PROVIDER_ENDPOINTS[provider]

  try {
    const headers = buildAuthHeaders(rawKey, provider)
    const timeoutSignal = AbortSignal.timeout(VALIDATION_TIMEOUT_MS)
    const combinedSignal = signal != null
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal

    const response = await fetch(endpoint, {
      method: provider === 'anthropic' ? 'POST' : 'GET',
      headers,
      signal: combinedSignal,
      ...(provider === 'anthropic'
        ? {
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'test' }],
            }),
          }
        : {}),
    })

    // 401/403 = invalid key, anything else might be rate limiting or other issue
    if (response.status === 401 || response.status === 403) {
      return { valid: false, reason: 'auth_failure', error: 'Invalid API key' }
    }

    // 200 or 429 (rate limited but authenticated) both indicate a valid key
    if (response.ok || response.status === 429) {
      return { valid: true }
    }

    return { valid: false, reason: 'unexpected_status', error: `Unexpected status: ${response.status}` }
  } catch (error) {
    if (signal?.aborted) {
      return { valid: false, reason: 'cancelled', error: 'Validation cancelled' }
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return { valid: false, reason: 'network_error', error: 'Validation timed out' }
    }
    return {
      valid: false,
      reason: 'network_error',
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

function buildAuthHeaders(
  rawKey: string,
  provider: Provider,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  switch (provider) {
    case 'anthropic':
      headers['x-api-key'] = rawKey
      headers['anthropic-version'] = '2023-06-01'
      break
    case 'google':
      headers['x-goog-api-key'] = rawKey
      break
    default:
      headers['Authorization'] = `Bearer ${rawKey}`
      break
  }

  return headers
}
