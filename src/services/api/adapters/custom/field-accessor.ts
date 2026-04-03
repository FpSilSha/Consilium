/**
 * Resolves a dot-notation path with array indexing against a nested object.
 *
 * Examples:
 *   getByPath(obj, "choices[0].delta.content")
 *   getByPath(obj, "usage.prompt_tokens")
 *   getByPath(obj, "error.message")
 *
 * Returns undefined for missing intermediate fields (never throws).
 */
export function getByPath(obj: unknown, path: string): unknown {
  if (path === '') return obj

  let current: unknown = obj
  const segments = parsePath(path)

  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return undefined

    if (typeof segment === 'number') {
      current = Array.isArray(current) ? current[segment] : undefined
    } else {
      current = (current as Record<string, unknown>)[segment]
    }
  }

  return current
}

/**
 * Builds a nested object from a dot-notation path and a value.
 *
 * Examples:
 *   setByPath("system", "hello")
 *     → { system: "hello" }
 *   setByPath("systemInstruction.parts[0].text", "hello")
 *     → { systemInstruction: { parts: [{ text: "hello" }] } }
 */
export function setByPath(path: string, value: unknown): Record<string, unknown> {
  const segments = parsePath(path)
  if (segments.length === 0) return {}

  const root: Record<string, unknown> = {}
  let current: Record<string, unknown> | unknown[] = root

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!
    const nextSegment = segments[i + 1]
    const nextIsArray = typeof nextSegment === 'number'

    if (typeof segment === 'number') {
      const arr = current as unknown[]
      const child = nextIsArray ? [] : {}
      arr[segment] = child
      current = child as Record<string, unknown> | unknown[]
    } else {
      const obj = current as Record<string, unknown>
      const child = nextIsArray ? [] : {}
      obj[segment] = child
      current = child as Record<string, unknown> | unknown[]
    }
  }

  const lastSegment = segments[segments.length - 1]!
  if (typeof lastSegment === 'number') {
    (current as unknown[])[lastSegment] = value
  } else {
    (current as Record<string, unknown>)[lastSegment] = value
  }

  return root
}

/**
 * Parses a dot-notation path into segments.
 * "choices[0].delta.content" → ["choices", 0, "delta", "content"]
 */
function parsePath(path: string): readonly (string | number)[] {
  const segments: (string | number)[] = []

  for (const part of path.split('.')) {
    // Handle array indexing: "choices[0]" → "choices", 0
    const bracketMatch = part.match(/^([^[]+)\[(\d+)\]$/)
    if (bracketMatch != null) {
      segments.push(bracketMatch[1]!)
      segments.push(parseInt(bracketMatch[2]!, 10))
    } else if (part !== '') {
      segments.push(part)
    }
  }

  return segments
}
