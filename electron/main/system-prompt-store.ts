import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Disk persistence for CUSTOM system prompts (both categories).
 *
 * One file holds both advisor and persona-switch custom entries —
 * discriminated by the `category` field on each row. Keeping them in a
 * single file matches the UI grouping (one "System Prompts" pane with
 * two sub-sections) and avoids two nearly-identical disk stores.
 *
 * Built-in entries live in src/features/systemPrompts/built-in-system-prompts.ts
 * and never touch this file — they're bundled with the app.
 *
 * Schema mirrors persona-store.ts: atomic write (tmp + rename), one
 * JSON file under {userData}/custom-system-prompts.json, row-level
 * validation that drops corrupt entries instead of losing the whole
 * file on the first bad row.
 */

export interface StoredSystemPrompt {
  readonly id: string
  readonly category: 'advisor' | 'persona-switch'
  readonly name: string
  readonly content: string
  readonly createdAt: number
  readonly updatedAt: number
}

const FILENAME = 'custom-system-prompts.json'

function getFilePath(): string {
  return join(app.getPath('userData'), FILENAME)
}

export function loadCustomSystemPrompts(): readonly StoredSystemPrompt[] {
  try {
    const content = readFileSync(getFilePath(), 'utf-8')
    const parsed: unknown = JSON.parse(content)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidStoredSystemPrompt)
  } catch {
    return []
  }
}

export function saveCustomSystemPrompt(entry: StoredSystemPrompt): void {
  const existing = loadCustomSystemPrompts()
  const idx = existing.findIndex((e) => e.id === entry.id)
  const updated = idx === -1
    ? [...existing, entry]
    : [...existing.slice(0, idx), entry, ...existing.slice(idx + 1)]
  atomicWrite(getFilePath(), JSON.stringify(updated, null, 2))
}

export function deleteCustomSystemPrompt(id: string): boolean {
  const existing = loadCustomSystemPrompts()
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
 * Type guard for a single system-prompt row. Rejects rows missing any
 * required field, with empty id/name/category, with an unknown
 * category string, or with non-positive timestamps. Content may be
 * empty — an empty custom prompt is legal (means "override to nothing"
 * for this category, distinct from the 'off' config mode).
 */
export function isValidStoredSystemPrompt(entry: unknown): entry is StoredSystemPrompt {
  if (entry == null || typeof entry !== 'object') return false
  const e = entry as Record<string, unknown>
  const validCategories = ['advisor', 'persona-switch']
  return (
    typeof e['id'] === 'string' && e['id'] !== '' &&
    typeof e['category'] === 'string' && validCategories.includes(e['category']) &&
    typeof e['name'] === 'string' && e['name'] !== '' &&
    typeof e['content'] === 'string' &&
    typeof e['createdAt'] === 'number' && Number.isFinite(e['createdAt']) && e['createdAt'] > 0 &&
    typeof e['updatedAt'] === 'number' && Number.isFinite(e['updatedAt']) && e['updatedAt'] > 0
  )
}
