import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Disk persistence for CUSTOM compact prompts — user-created summary
 * prompt templates used by both the manual Compact button and the
 * auto-compaction pipeline.
 *
 * Single file at {userData}/custom-compact-prompts.json. Mirrors the
 * atomic write + row-level validation pattern from the other library
 * stores.
 */

export interface StoredCompactPrompt {
  readonly id: string
  readonly name: string
  readonly content: string
  readonly createdAt: number
  readonly updatedAt: number
}

const FILENAME = 'custom-compact-prompts.json'

function getFilePath(): string {
  return join(app.getPath('userData'), FILENAME)
}

export function loadCustomCompactPrompts(): readonly StoredCompactPrompt[] {
  try {
    const content = readFileSync(getFilePath(), 'utf-8')
    const parsed: unknown = JSON.parse(content)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidStoredCompactPrompt)
  } catch {
    return []
  }
}

export function saveCustomCompactPrompt(entry: StoredCompactPrompt): void {
  const existing = loadCustomCompactPrompts()
  const idx = existing.findIndex((e) => e.id === entry.id)
  const updated = idx === -1
    ? [...existing, entry]
    : [...existing.slice(0, idx), entry, ...existing.slice(idx + 1)]
  atomicWrite(getFilePath(), JSON.stringify(updated, null, 2))
}

export function deleteCustomCompactPrompt(id: string): boolean {
  const existing = loadCustomCompactPrompts()
  const filtered = existing.filter((e) => e.id !== id)
  if (filtered.length === existing.length) return false
  atomicWrite(getFilePath(), JSON.stringify(filtered, null, 2))
  return true
}

function atomicWrite(filePath: string, content: string): void {
  const dirPath = app.getPath('userData')
  mkdirSync(dirPath, { recursive: true })
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, content, 'utf-8')
  renameSync(tmpPath, filePath)
}

/**
 * Row-level validation. Rejects missing id/name, empty id/name, or
 * invalid timestamps. Content may be empty (the resolver's fallback
 * keeps compaction working, but the user has chosen a no-op template).
 */
export function isValidStoredCompactPrompt(entry: unknown): entry is StoredCompactPrompt {
  if (entry == null || typeof entry !== 'object') return false
  const e = entry as Record<string, unknown>
  return (
    typeof e['id'] === 'string' && e['id'] !== '' &&
    typeof e['name'] === 'string' && e['name'] !== '' &&
    typeof e['content'] === 'string' &&
    typeof e['createdAt'] === 'number' && Number.isFinite(e['createdAt']) && e['createdAt'] > 0 &&
    typeof e['updatedAt'] === 'number' && Number.isFinite(e['updatedAt']) && e['updatedAt'] > 0
  )
}
