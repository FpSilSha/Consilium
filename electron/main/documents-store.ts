import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  statSync,
} from 'fs'
import { resolve, sep } from 'path'
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
  /**
   * Compile preset ID used when producing this document. Optional for
   * back-compat with files written before the preset system existed.
   */
  readonly presetId?: string
  /**
   * True if the user's focus prompt fully replaced the preset's default
   * instructions. Display-only; no runtime behavior depends on this.
   */
  readonly focusReplacedDefault?: boolean
}

/**
 * Cached because `app.getPath('userData')` is idempotent but non-trivial,
 * and we need a stable resolved path for the containment check.
 */
let cachedDocumentsDir: string | null = null
function getDocumentsDir(): string {
  if (cachedDocumentsDir === null) {
    cachedDocumentsDir = resolve(app.getPath('userData'), 'documents')
  }
  return cachedDocumentsDir
}

/**
 * Validates an incoming document ID. IDs come from the renderer over IPC and
 * may be arbitrary strings — we accept only the shape produced by
 * `crypto.randomUUID()` (36 chars, hyphenated hex). This eliminates path
 * traversal, weird filename, and accidental collision concerns at the source
 * rather than relying on per-call sanitization.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && UUID_PATTERN.test(id)
}

/**
 * Builds the on-disk path for a document by ID. Throws if the ID is not a
 * valid UUID, AND defensively re-checks that the resolved path is still
 * inside the documents directory (belt-and-suspenders against any future
 * change that loosens the UUID check).
 */
function getFilePath(id: string): string {
  if (!isValidId(id)) {
    throw new Error('Invalid document id — must be a UUID')
  }
  const dir = getDocumentsDir()
  const filePath = resolve(dir, `${id}.json`)
  // Containment check: resolved path must start with the documents dir
  // followed by a separator. Defends against any future loosening of the
  // UUID validation that might let traversal sequences through.
  const dirWithSep = dir.endsWith(sep) ? dir : dir + sep
  if (!filePath.startsWith(dirWithSep)) {
    throw new Error('Document path escapes documents directory')
  }
  return filePath
}

function ensureDir(): void {
  const dir = getDocumentsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export function loadDocument(id: string): PersistedDocument | null {
  let filePath: string
  try {
    filePath = getFilePath(id)
  } catch {
    return null
  }
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
  // getFilePath validates the ID and rejects anything not a UUID, so we
  // don't need a separate sanity check here.
  const filePath = getFilePath(doc.id)

  // Atomic write: write to .tmp then rename
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(doc, null, 2), 'utf-8')
  renameSync(tmpPath, filePath)
}

export function deleteDocument(id: string): boolean {
  let filePath: string
  try {
    filePath = getFilePath(id)
  } catch {
    return false
  }
  if (!existsSync(filePath)) return false

  try {
    const stat = statSync(filePath)
    if (!stat.isFile()) return false
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
