import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function getKeysFilePath(): string {
  return join(app.getPath('userData'), 'keys.json')
}

/**
 * Validates a provider ID: alphanumeric, underscores, hyphens, 1-128 chars.
 */
export function isValidProviderId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && /^[A-Za-z0-9_-]+$/.test(id)
}

function readKeysFile(): Record<string, string> {
  const filePath = getKeysFilePath()
  if (!existsSync(filePath)) return {}

  try {
    const content = readFileSync(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(content)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

    // Validate each entry: skip prototype pollution keys, require string values
    const result: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (PROTO_KEYS.has(k)) continue
      if (typeof v === 'string') {
        result[k] = v
      }
    }
    return result
  } catch {
    return {}
  }
}

function writeKeysFile(entries: Readonly<Record<string, string>>): void {
  const filePath = getKeysFilePath()
  const dir = dirname(filePath)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Atomic write: write to .tmp then rename
  const tmpPath = filePath + '.tmp'
  writeFileSync(tmpPath, JSON.stringify(entries, null, 2), { encoding: 'utf-8', mode: 0o600 })
  renameSync(tmpPath, filePath)
}

/**
 * Returns whether safeStorage encryption is available on this platform.
 */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

/**
 * Loads and decrypts all stored keys.
 * Returns an array of { providerId, rawKey } objects.
 * Logs a count of failed decryptions (not key data) to stderr.
 */
export function loadEncryptedKeys(): readonly { providerId: string; rawKey: string }[] {
  if (!isEncryptionAvailable()) return []

  const entries = readKeysFile()
  const result: { providerId: string; rawKey: string }[] = []
  let failedCount = 0

  for (const [providerId, base64Encrypted] of Object.entries(entries)) {
    try {
      const buffer = Buffer.from(base64Encrypted, 'base64')
      const rawKey = safeStorage.decryptString(buffer)
      result.push({ providerId, rawKey })
    } catch {
      failedCount += 1
    }
  }

  if (failedCount > 0) {
    console.error(`[key-store] Failed to decrypt ${failedCount} key(s) — re-enter affected keys`)
  }

  return result
}

/**
 * Encrypts and saves a key for a provider.
 * Overwrites any existing key for that provider.
 */
export function saveEncryptedKey(providerId: string, rawKey: string): void {
  if (!isValidProviderId(providerId)) {
    throw new Error('Invalid provider ID format')
  }
  if (!isEncryptionAvailable()) {
    throw new Error('Encryption not available on this platform')
  }

  const encrypted = safeStorage.encryptString(rawKey)
  const base64 = encrypted.toString('base64')

  const entries = readKeysFile()
  const updated = { ...entries, [providerId]: base64 }
  writeKeysFile(updated)
}

/**
 * Removes a stored key for a provider.
 */
export function deleteEncryptedKey(providerId: string): void {
  if (!isValidProviderId(providerId)) {
    throw new Error('Invalid provider ID format')
  }
  const entries = readKeysFile()
  const { [providerId]: _, ...remaining } = entries
  writeKeysFile(remaining)
}
