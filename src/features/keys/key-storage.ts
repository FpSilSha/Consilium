import type { ApiKey, Provider } from '@/types'
import { detectProvider, maskKey } from './key-detection'

function generateKeyId(): string {
  return crypto.randomUUID()
}

export function createApiKeyEntry(
  rawKey: string,
  providerOverride?: Provider,
): ApiKey | null {
  const trimmed = rawKey.trim()
  if (trimmed === '') return null

  const detected = detectProvider(trimmed)
  const provider = providerOverride ?? detected?.provider

  if (provider === undefined) return null

  return {
    id: generateKeyId(),
    provider,
    maskedKey: maskKey(trimmed),
    createdAt: Date.now(),
    verified: false,
  }
}

export function parseEnvToKeys(
  envEntries: Readonly<Record<string, string>>,
): readonly ApiKey[] {
  const keys: ApiKey[] = []

  for (const [envKey, envValue] of Object.entries(envEntries)) {
    if (!envKey.startsWith('CONSILIUM_KEY_')) continue

    const parts = envKey.replace('CONSILIUM_KEY_', '').split('_')
    const provider = parts[0]?.toLowerCase()

    if (!isValidProvider(provider)) continue

    const entry = createApiKeyEntry(envValue, provider)
    if (entry !== null) {
      keys.push(entry)
    }
  }

  return keys
}

export function keysToEnv(
  keys: readonly ApiKey[],
  rawKeys: Readonly<Record<string, string>>,
): Record<string, string> {
  const env: Record<string, string> = {}
  const providerCounts: Record<string, number> = {}

  for (const key of keys) {
    const count = (providerCounts[key.provider] ?? 0) + 1
    providerCounts[key.provider] = count

    const rawKey = rawKeys[key.id]
    if (rawKey !== undefined) {
      env[`CONSILIUM_KEY_${key.provider.toUpperCase()}_${count}`] = rawKey
    }
  }

  return env
}

export function isValidProvider(value: string | undefined): value is Provider {
  return (
    value === 'anthropic' ||
    value === 'openai' ||
    value === 'google' ||
    value === 'xai' ||
    value === 'deepseek' ||
    value === 'openrouter' ||
    value === 'custom'
  )
}
