/**
 * Removes machine- and account-identifying strings (the signed-in email, the
 * home and temp paths) from advisor output before it leaves the main process.
 *
 * Claude Code injects that context into every turn and offers no switch to
 * turn it off; advisors share one transcript with other providers, so any
 * repetition would be sent onward. Terms live only for one turn.
 *
 * This is a mitigation, not a guarantee: exact matching cannot catch a
 * transformed, encoded or fragmentary repetition, and it cannot remove what
 * the runtime has already put in the model's context.
 */

const REPLACEMENT = '[redacted]'
const MIN_TERM_LENGTH = 6
/** A stream cut off mid-term, ending in at least this many characters of it, has that tail redacted. */
const MIN_TRAILING_PREFIX = 4

export interface RedactionTerms {
  /** Matched anywhere (full email, paths). */
  readonly exact: readonly string[]
  /** Matched only as a whole word, so a name part like "support" leaves "supported" alone. */
  readonly words: readonly string[]
}

export interface Redactor {
  /** Returns the text that is safe to emit now; a short raw tail is held back. */
  push(text: string): string
  /**
   * Releases the held-back tail at the end of the stream. `cutOff` marks a
   * stream that ended abnormally (cancel, error, crash): then a trailing piece
   * that starts spelling a term is redacted too. A normally finished reply is
   * left alone, so its last word isn't mangled.
   */
  flush(cutOff?: boolean): string
  /** Redacts a complete string, such as an error message. */
  redact(text: string): string
}

/**
 * Characters that continue a Latin-script word. Scripts written without
 * spaces (CJK, kana, Thai) count as boundaries, so `jane.doeさん` is still
 * caught; so does `_`, so Markdown emphasis like `_jane.doe_` is caught too.
 */
const WORD_CHAR = '[\\p{Script=Latin}\\p{N}]'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff
}

export function createRedactor(terms: RedactionTerms): Redactor {
  const usable = (list: readonly string[]): string[] => [...new Set(list.filter((t) => t.length >= MIN_TERM_LENGTH))]
  const exact = usable(terms.exact)
  const words = usable(terms.words)
  const all = [...exact, ...words]
  if (all.length === 0) {
    return { push: (text) => text, flush: () => '', redact: (text) => text }
  }

  const alternatives = [
    ...exact.map((t) => ({ length: t.length, source: escapeRegExp(t) })),
    ...words.map((t) => ({ length: t.length, source: `(?<!${WORD_CHAR})${escapeRegExp(t)}(?!${WORD_CHAR})` })),
  ].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(alternatives.map((a) => a.source).join('|'), 'giu')
  const lowerTerms = all.map((t) => t.toLowerCase())

  // Held back so a match starting before the boundary is complete (longest
  // terms match first) and a whole-word term has its following character.
  const holdBack = Math.max(0, ...exact.map((t) => t.length - 1), ...words.map((t) => t.length))

  /**
   * Replaces matches that start at or after `from` and before `until` in
   * `scan`; returns the output and where unprocessed text resumes.
   */
  const replaceRange = (scan: string, from: number, until: number): { out: string; cursor: number } => {
    let out = ''
    let cursor = from
    pattern.lastIndex = from
    for (let m = pattern.exec(scan); m !== null && m.index < until; m = pattern.exec(scan)) {
      out += scan.slice(cursor, m.index) + REPLACEMENT
      cursor = m.index + m[0].length
    }
    return { out, cursor }
  }

  /**
   * Where a cut-off stream's raw tail starts to spell a term (at least
   * MIN_TRAILING_PREFIX characters of it), or -1. Checked on raw text, before
   * any replacement, so a shorter whole-word match can't hide the rest.
   */
  const wordChar = new RegExp(WORD_CHAR, 'u')
  const trailingPrefixStart = (scan: string, from: number): number => {
    for (let start = Math.max(from, scan.length - (holdBack + 1)); start <= scan.length - MIN_TRAILING_PREFIX; start++) {
      // A term starting with a word character starts at a word boundary:
      // "benchmark" never begins "mark.smith@…". Terms like "/Users/x" can start anywhere.
      const afterWord = start > 0 && wordChar.test(scan.slice(start - 1, start))
      const tail = scan.slice(start).toLowerCase()
      const begins = (t: string): boolean => t.length > tail.length && t.startsWith(tail) && !(afterWord && wordChar.test(t.slice(0, 1)))
      if (lowerTerms.some(begins)) return start
    }
    return -1
  }

  const redactWhole = (text: string, context: string): string => {
    const scan = context + text
    const { out, cursor } = replaceRange(scan, context.length, scan.length)
    return out + scan.slice(cursor)
  }

  // Raw, not yet redacted text; `context` is the last already-emitted raw
  // character, kept so whole-word checks can look behind the cut.
  let buffer = ''
  let context = ''

  return {
    push(text) {
      buffer += text
      let boundary = buffer.length - holdBack
      if (boundary <= 0) return ''
      if (isHighSurrogate(buffer.charCodeAt(boundary - 1))) boundary -= 1
      const scan = context + buffer
      const base = context.length
      const { out, cursor } = replaceRange(scan, base, base + boundary)
      const cut = Math.max(base + boundary, cursor)
      const emitted = out + scan.slice(cursor, cut)
      if (cut > base) {
        // Keep a whole code point (a surrogate pair) as look-behind context.
        const pair = cut >= 2 && isLowSurrogate(scan.charCodeAt(cut - 1)) && isHighSurrogate(scan.charCodeAt(cut - 2))
        context = scan.slice(pair ? cut - 2 : cut - 1, cut)
        buffer = scan.slice(cut)
      }
      return emitted
    },
    flush(cutOff = false) {
      const scan = context + buffer
      const base = context.length
      const partial = cutOff ? trailingPrefixStart(scan, base) : -1
      const end = partial === -1 ? scan.length : partial
      const { out, cursor } = replaceRange(scan, base, end)
      let result = out
      if (cursor <= end) {
        result += scan.slice(cursor, end) + (partial === -1 ? '' : REPLACEMENT)
      } else if (cursor < scan.length) {
        // A match ran past the start of the unfinished term; the rest belongs to it.
        result += REPLACEMENT
      }
      buffer = ''
      context = ''
      return result
    },
    redact: (text) => redactWhole(text, ''),
  }
}

/**
 * The account email is matched anywhere; its name part (with and without a
 * `+tag`) only as a whole word. Shorter or transformed fragments are not
 * caught: that is a known limitation of exact matching.
 */
export function emailTerms(email: string): RedactionTerms {
  const at = email.indexOf('@')
  if (at <= 0) return { exact: [email], words: [] }
  const local = email.slice(0, at)
  const plus = local.indexOf('+')
  return { exact: [email], words: plus > 0 ? [local, local.slice(0, plus)] : [local] }
}

/** The spellings a model may use when repeating a path. */
export function sensitivePathVariants(path: string): readonly string[] {
  if (!path.includes('\\')) return [path]
  return [path, path.replace(/\\/g, '/'), path.replace(/\\/g, '\\\\')]
}
