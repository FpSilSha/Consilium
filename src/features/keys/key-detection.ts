import type { Provider } from '@/types'

interface DetectionResult {
  readonly provider: Provider
  readonly confidence: 'high' | 'ambiguous'
}

const KEY_PREFIXES: readonly { readonly prefix: string; readonly provider: Provider; readonly confidence: 'high' | 'ambiguous' }[] = [
  { prefix: 'sk-ant-', provider: 'anthropic', confidence: 'high' },
  { prefix: 'sk-proj-', provider: 'openai', confidence: 'high' },
  { prefix: 'AIza', provider: 'google', confidence: 'high' },
  { prefix: 'xai-', provider: 'xai', confidence: 'high' },
  // DeepSeek uses generic 'sk-' prefix — ambiguous with legacy OpenAI keys
  { prefix: 'sk-', provider: 'deepseek', confidence: 'ambiguous' },
]

export function detectProvider(apiKey: string): DetectionResult | null {
  const trimmed = apiKey.trim()
  if (trimmed === '') return null

  for (const entry of KEY_PREFIXES) {
    if (trimmed.startsWith(entry.prefix)) {
      return { provider: entry.provider, confidence: entry.confidence }
    }
  }

  return null
}

export function maskKey(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (trimmed.length <= 8) return '••••••••'

  const prefix = trimmed.slice(0, 4)
  const suffix = trimmed.slice(-4)
  return `${prefix}${'••••••••'}${suffix}`
}

const KEY_PATTERNS: readonly RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /sk-proj-[A-Za-z0-9_-]{20,}/g,
  /sk-(?!ant-|proj-)[A-Za-z0-9_-]{20,}/g,
  /AIza[A-Za-z0-9_-]{30,}/g,
  /xai-[A-Za-z0-9_-]{20,}/g,
]

export function redactKeys(text: string): string {
  let result = text
  for (const pattern of KEY_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]')
  }
  return result
}
