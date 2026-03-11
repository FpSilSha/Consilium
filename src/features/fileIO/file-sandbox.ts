/**
 * File I/O sandboxing.
 * Enforces that all file operations stay within allowed directories.
 * Input files are copied to /input/{session-id}/.
 * Output files can only be written to /output/{session-id}/.
 * File paths are never exposed to LLMs — only content.
 */

const ALLOWED_SUBDIRS = ['input', 'output', 'sessions', 'personas', 'themes'] as const

/**
 * Validates that a path is within an allowed sandbox directory.
 */
export function isPathSandboxed(
  path: string,
  userDataPath: string,
): boolean {
  const normalized = normalizePath(path)
  const normalizedBase = normalizePath(userDataPath)

  // Append / to prevent prefix confusion (e.g., /sessions-evil matching /sessions)
  if (!normalized.startsWith(normalizedBase + '/')) return false

  const relative = normalized.slice(normalizedBase.length + 1)
  const firstSegment = relative.split('/')[0]

  return ALLOWED_SUBDIRS.some((dir) => firstSegment === dir)
}

/**
 * Builds the input directory path for a session.
 */
export function getSessionInputDir(
  userDataPath: string,
  sessionId: string,
): string {
  return `${userDataPath}/input/${sanitizePathSegment(sessionId)}`
}

/**
 * Builds the output directory path for a session.
 */
export function getSessionOutputDir(
  userDataPath: string,
  sessionId: string,
): string {
  return `${userDataPath}/output/${sanitizePathSegment(sessionId)}`
}

/**
 * Builds the sessions directory path.
 */
export function getSessionsDir(userDataPath: string): string {
  return `${userDataPath}/sessions`
}

/**
 * Sanitizes a path segment to prevent directory traversal.
 */
export function sanitizePathSegment(segment: string): string {
  return segment
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 128)
}

/**
 * Strips the file path from content before sending to an LLM.
 * Returns a safe descriptor: "Content of [filename]:" + content.
 */
export function prepareFileContent(
  filename: string,
  content: string,
): string {
  const safeName = filename.replace(/[<>:"/\\|?*]/g, '_')
  return `[Content of file: ${safeName}]\n\n${content}`
}

/**
 * Builds a relative path within a session subdirectory.
 */
export function buildRelativePath(
  subdir: 'input' | 'output',
  sessionId: string,
  filename: string,
): string {
  return `${subdir}/${sanitizePathSegment(sessionId)}/${sanitizePathSegment(filename)}`
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}
