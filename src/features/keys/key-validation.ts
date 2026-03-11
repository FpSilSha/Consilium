import type { Provider } from '@/types'

interface ValidationResult {
  readonly valid: boolean
  readonly error?: string | undefined
}

const PROVIDER_ENDPOINTS: Readonly<Record<Provider, string>> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/models',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
  xai: 'https://api.x.ai/v1/models',
  deepseek: 'https://api.deepseek.com/v1/models',
}

export async function validateKey(
  rawKey: string,
  provider: Provider,
  signal?: AbortSignal,
): Promise<ValidationResult> {
  const endpoint = PROVIDER_ENDPOINTS[provider]

  try {
    const headers = buildAuthHeaders(rawKey, provider)

    const response = await fetch(endpoint, {
      method: provider === 'anthropic' ? 'POST' : 'GET',
      headers,
      signal,
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
      return { valid: false, error: 'Invalid API key' }
    }

    // 200 or 429 (rate limited but authenticated) both indicate a valid key
    if (response.ok || response.status === 429) {
      return { valid: true }
    }

    return { valid: false, error: `Unexpected status: ${response.status}` }
  } catch (error) {
    if (signal?.aborted) {
      return { valid: false, error: 'Validation cancelled' }
    }
    return {
      valid: false,
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
