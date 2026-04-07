import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Disk persistence for CUSTOM personas.
 *
 * Built-in personas live in code (`src/features/personas/built-in-personas.ts`)
 * and are bundled with the app — they never touch this file. Custom personas
 * are user-created and persisted as a single JSON array under
 * `{userData}/custom-personas.json`. The file is read on startup, mirrored
 * into the renderer Zustand store, and re-written via the personas:save IPC
 * handler whenever the user adds/edits/deletes one.
 *
 * Schema mirrors the renderer-side `Persona` type but stores ONLY fields a
 * custom persona actually has. `filePath` is synthesized at hydration time
 * (see `toPersona`) so the renderer can treat custom and built-in personas
 * uniformly via the existing `Persona` interface — there's no real .md file
 * on disk for customs, just an entry in this JSON array.
 *
 * Atomic write semantics match `adapter-store.ts`: write to a tmp path,
 * rename onto the target. Either the old file is intact or the new one is —
 * never a partial write.
 */

export interface StoredCustomPersona {
  readonly id: string
  readonly name: string
  readonly content: string
  readonly createdAt: number
  readonly updatedAt: number
}

const FILENAME = 'custom-personas.json'

function getFilePath(): string {
  return join(app.getPath('userData'), FILENAME)
}

/**
 * Loads all custom personas from disk. Returns an empty array if the file
 * is missing, unparseable, or contains no valid entries. Invalid entries
 * inside an otherwise-valid array are dropped silently — corruption of one
 * row should not lose every other persona the user has saved.
 */
export function loadCustomPersonas(): readonly StoredCustomPersona[] {
  try {
    const content = readFileSync(getFilePath(), 'utf-8')
    const parsed: unknown = JSON.parse(content)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidCustomPersona)
  } catch {
    return []
  }
}

/**
 * Upserts a custom persona by ID. The renderer is responsible for
 * generating a stable, collision-resistant ID before calling this — the
 * store does not auto-generate one because the ID is user-visible (it
 * shows up on advisor windows that reference this persona).
 */
export function saveCustomPersona(persona: StoredCustomPersona): void {
  const existing = loadCustomPersonas()
  const idx = existing.findIndex((p) => p.id === persona.id)
  const updated = idx === -1
    ? [...existing, persona]
    : [...existing.slice(0, idx), persona, ...existing.slice(idx + 1)]
  atomicWrite(getFilePath(), JSON.stringify(updated, null, 2))
}

/**
 * Removes a custom persona by ID. No-op if the ID is not present — the
 * renderer may have already removed the entry from its in-memory state and
 * be calling this idempotently to clean disk, so silently succeeding is
 * the correct behavior.
 *
 * Returns true if anything was actually removed, false otherwise. The
 * renderer can use this to log or surface "persona was already gone" if
 * desired (currently it does not).
 */
export function deleteCustomPersona(id: string): boolean {
  const existing = loadCustomPersonas()
  const filtered = existing.filter((p) => p.id !== id)
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
 * Type guard for a single persona row. Validates required fields and
 * rejects rows with empty strings, non-finite timestamps, or wrong types.
 * Used by both `loadCustomPersonas` (to drop corrupt rows) and the IPC
 * `personas:save` handler (to reject invalid input from the renderer).
 *
 * Notes on the validation rules:
 *
 *  - `id` and `name` must be non-empty strings. The renderer enforces a
 *    30-character cap on `name` (see persona-validators.ts) but the main
 *    process does NOT enforce length — it accepts whatever the renderer
 *    sends and treats the renderer as the validation owner. This avoids
 *    duplicating the limit in two places that could drift.
 *
 *  - `content` must be a string but MAY be empty. An empty persona body
 *    means "no special instructions" which is a legal use case (e.g., the
 *    user wants the model's default behavior under a custom label).
 *
 *  - `createdAt` and `updatedAt` must be positive finite numbers (epoch
 *    millis). NaN, Infinity, and zero are rejected — zero is suspicious
 *    and almost always indicates a serialization bug.
 */
export function isValidCustomPersona(entry: unknown): entry is StoredCustomPersona {
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
