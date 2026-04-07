import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  statSync,
} from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'

/**
 * A compiled document — produced by the user via the Compile Document button.
 *
 * Stored as a standalone JSON file per document in `<userData>/documents/`,
 * referenced from sessions by ID. Sessions hold a list of document IDs;
 * when a referenced file is missing on session load, the reference is
 * silently dropped (graceful degradation — no crash, no migration).
 */
export interface PersistedDocument {
  readonly id: string
  readonly title: string
  readonly content: string
  /** Provider/model used to generate this document — for display only. */
  readonly provider: string
  readonly model: string
  readonly modelName: string
  readonly cost: number
  readonly createdAt: number
  /** The user's optional focus prompt, if any was provided. */
  readonly focusPrompt?: string
}

function getDocumentsDir(): string {
  return join(app.getPath('userData'), 'documents')
}

function getFilePath(id: string): string {
  // Defensive: id should be a UUID. Strip path separators just in case.
  const safeId = id.replace(/[/\\]/g, '_')
  return join(getDocumentsDir(), `${safeId}.json`)
}

function ensureDir(): void {
  const dir = getDocumentsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export function listDocuments(): readonly { readonly id: string; readonly title: string; readonly createdAt: number; readonly modelName: string }[] {
  ensureDir()
  const dir = getDocumentsDir()
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }

  const results: { id: string; title: string; createdAt: number; modelName: string }[] = []
  for (const filename of entries) {
    if (!filename.endsWith('.json')) continue
    try {
      const content = readFileSync(join(dir, filename), 'utf-8')
      const parsed: unknown = JSON.parse(content)
      if (!isValidDocument(parsed)) continue
      results.push({
        id: parsed.id,
        title: parsed.title,
        createdAt: parsed.createdAt,
        modelName: parsed.modelName,
      })
    } catch {
      // Skip corrupted file — don't crash listing
    }
  }
  return results
}

export function loadDocument(id: string): PersistedDocument | null {
  const filePath = getFilePath(id)
  if (!existsSync(filePath)) return null

  try {
    const content = readFileSync(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(content)
    if (!isValidDocument(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveDocument(doc: PersistedDocument): void {
  if (!isValidDocument(doc)) {
    throw new Error('Invalid document — missing required fields')
  }

  ensureDir()
  const filePath = getFilePath(doc.id)

  // Atomic write: write to .tmp then rename
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(doc, null, 2), 'utf-8')
  renameSync(tmpPath, filePath)
}

export function deleteDocument(id: string): boolean {
  const filePath = getFilePath(id)
  if (!existsSync(filePath)) return false

  try {
    // Sanity check — only delete if it's actually a file in our documents dir
    const stat = statSync(filePath)
    if (!stat.isFile()) return false
    if (dirname(filePath) !== getDocumentsDir()) return false

    unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

export function isValidDocument(entry: unknown): entry is PersistedDocument {
  if (entry == null || typeof entry !== 'object') return false
  const e = entry as Record<string, unknown>
  return (
    typeof e['id'] === 'string' && e['id'] !== '' &&
    typeof e['title'] === 'string' &&
    typeof e['content'] === 'string' &&
    typeof e['provider'] === 'string' &&
    typeof e['model'] === 'string' &&
    typeof e['modelName'] === 'string' &&
    typeof e['cost'] === 'number' &&
    typeof e['createdAt'] === 'number'
    // focusPrompt is optional — not validated here
  )
}
