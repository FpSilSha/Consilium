import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

interface StoredAdapterDef {
  readonly id: string
  readonly name: string
  readonly request: Record<string, unknown>
  readonly response: Record<string, unknown>
  readonly createdAt: number
  readonly updatedAt: number
}

const FILENAME = 'adapters.json'

function getFilePath(): string {
  return join(app.getPath('userData'), FILENAME)
}

/**
 * Loads all saved custom adapter definitions from disk.
 * Returns empty array if the file doesn't exist or is corrupted.
 */
export function loadAdapterDefinitions(): readonly StoredAdapterDef[] {
  try {
    const content = readFileSync(getFilePath(), 'utf-8')
    const parsed: unknown = JSON.parse(content)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidAdapterDef)
  } catch {
    return []
  }
}

/**
 * Saves a custom adapter definition to disk.
 * Creates or updates by ID (upsert).
 */
export function saveAdapterDefinition(def: StoredAdapterDef): void {
  const existing = loadAdapterDefinitions()
  const idx = existing.findIndex((d) => d.id === def.id)
  const updated = idx === -1
    ? [...existing, def]
    : [...existing.slice(0, idx), def, ...existing.slice(idx + 1)]

  const dirPath = app.getPath('userData')
  mkdirSync(dirPath, { recursive: true })

  // Atomic write: tmp then rename
  const filePath = getFilePath()
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(updated, null, 2), 'utf-8')

  // Rename is atomic on most filesystems
  const { renameSync } = require('fs') as typeof import('fs')
  renameSync(tmpPath, filePath)
}

/**
 * Deletes a custom adapter definition by ID.
 */
export function deleteAdapterDefinition(id: string): void {
  const existing = loadAdapterDefinitions()
  const filtered = existing.filter((d) => d.id !== id)
  if (filtered.length === existing.length) return // nothing to delete

  const dirPath = app.getPath('userData')
  mkdirSync(dirPath, { recursive: true })
  writeFileSync(getFilePath(), JSON.stringify(filtered, null, 2), 'utf-8')
}

function isValidAdapterDef(entry: unknown): entry is StoredAdapterDef {
  if (entry == null || typeof entry !== 'object') return false
  const e = entry as Record<string, unknown>
  return (
    typeof e['id'] === 'string' && e['id'] !== '' &&
    typeof e['name'] === 'string' && e['name'] !== '' &&
    typeof e['request'] === 'object' && e['request'] != null &&
    typeof e['response'] === 'object' && e['response'] != null &&
    typeof e['createdAt'] === 'number' &&
    typeof e['updatedAt'] === 'number'
  )
}
