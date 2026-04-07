import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Disk persistence for CUSTOM compile prompts — user-created entries
 * that appear in the Compile Document dropdown alongside the 5 base
 * presets shipped in `src/features/chat/compile-presets.ts`.
 *
 * One file: {userData}/custom-compile-prompts.json. Atomic write
 * (tmp + rename), row-level validation to drop corrupt entries
 * without losing the whole library. Mirrors persona-store.ts and
 * system-prompt-store.ts.
 */

export interface StoredCompilePrompt {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly prompt: string
  readonly createdAt: number
  readonly updatedAt: number
}

const FILENAME = 'custom-compile-prompts.json'

function getFilePath(): string {
  return join(app.getPath('userData'), FILENAME)
}

export function loadCustomCompilePrompts(): readonly StoredCompilePrompt[] {
  try {
    const content = readFileSync(getFilePath(), 'utf-8')
    const parsed: unknown = JSON.parse(content)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidStoredCompilePrompt)
  } catch {
    return []
  }
}

export function saveCustomCompilePrompt(entry: StoredCompilePrompt): void {
  const existing = loadCustomCompilePrompts()
  const idx = existing.findIndex((e) => e.id === entry.id)
  const updated = idx === -1
    ? [...existing, entry]
    : [...existing.slice(0, idx), entry, ...existing.slice(idx + 1)]
  atomicWrite(getFilePath(), JSON.stringify(updated, null, 2))
}

export function deleteCustomCompilePrompt(id: string): boolean {
  const existing = loadCustomCompilePrompts()
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
 * Row-level validation. Rejects rows missing required fields, with
 * empty id/label/prompt, with negative or zero timestamps. Description
 * may be empty (it's a UI hint, not required for the compile API call).
 * Prompt may NOT be empty — a compile prompt with no content is
 * meaningless and would crash the model call.
 */
export function isValidStoredCompilePrompt(entry: unknown): entry is StoredCompilePrompt {
  if (entry == null || typeof entry !== 'object') return false
  const e = entry as Record<string, unknown>
  return (
    typeof e['id'] === 'string' && e['id'] !== '' &&
    typeof e['label'] === 'string' && e['label'] !== '' &&
    typeof e['description'] === 'string' &&
    typeof e['prompt'] === 'string' && e['prompt'] !== '' &&
    typeof e['createdAt'] === 'number' && Number.isFinite(e['createdAt']) && e['createdAt'] > 0 &&
    typeof e['updatedAt'] === 'number' && Number.isFinite(e['updatedAt']) && e['updatedAt'] > 0
  )
}
