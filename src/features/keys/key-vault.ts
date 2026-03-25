/**
 * In-memory vault for raw API keys.
 * Keys are loaded from encrypted safeStorage via IPC on startup and stored here.
 * The Zustand store only holds masked keys for display.
 * This module provides the raw key when needed for API calls.
 */

let vault: ReadonlyMap<string, string> = new Map()

/**
 * Loads raw keys from env entries into the vault.
 * Called during app initialization after reading .env.
 */
export function loadKeysIntoVault(
  envEntries: Readonly<Record<string, string>>,
  keyIdMapping: ReadonlyMap<string, string>,
): void {
  const entries = new Map<string, string>()
  for (const [keyId, envVarName] of keyIdMapping) {
    const rawValue = envEntries[envVarName]
    if (rawValue !== undefined) {
      entries.set(keyId, rawValue)
    }
  }
  vault = entries
}

/**
 * Stores a single raw key in the vault (used when adding a new key).
 */
export function storeRawKey(keyId: string, rawKey: string): void {
  const entries = new Map(vault)
  entries.set(keyId, rawKey)
  vault = entries
}

/**
 * Retrieves a raw API key by its key ID.
 */
export function getRawKey(keyId: string): string | null {
  return vault.get(keyId) ?? null
}

/**
 * Removes a raw key from the vault.
 */
export function removeRawKey(keyId: string): void {
  const entries = new Map(vault)
  entries.delete(keyId)
  vault = entries
}

/**
 * Clears all keys from the vault.
 */
export function clearVault(): void {
  vault = new Map()
}
