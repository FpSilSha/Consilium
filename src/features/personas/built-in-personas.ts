import type { Persona } from '@/types'

/**
 * Built-in personas — sourced from `personas/*.md` at the repo root.
 *
 * Vite's `import.meta.glob` reads every `.md` file in the personas/
 * folder at BUILD TIME, inlines each file's content into the bundle
 * as a string, and gives us a `{ filepath: content }` map. There is
 * NO runtime file I/O — Vite has already embedded the strings in
 * the JS bundle by the time the app starts. This means:
 *
 *   - The personas/ folder doesn't need to be shipped with the
 *     packaged Electron app. The .md content is already in the
 *     renderer JS.
 *
 *   - To add, remove, or edit base personas: drop / modify /
 *     delete files in `personas/*.md` and rebuild. The next build
 *     picks up the change. No code changes needed.
 *
 *   - If a file is malformed (no `# heading`, wrong shape, parse
 *     error), it's skipped with a console.warn. The rest of the
 *     personas still load. The app does not crash.
 *
 *   - If the personas folder is empty, BUILT_IN_PERSONAS is an
 *     empty array. The store still works — the user just sees an
 *     empty Base tab in the Personas pane and can create custom
 *     personas as usual.
 *
 * Each persona's display name comes from the first `# H1 heading`
 * in the file. The `id` is `builtin_<filename>` (without the .md
 * extension), which keeps the `builtin_` prefix invariant the
 * personas slice's reserved-id guard relies on.
 *
 * The order in BUILT_IN_PERSONAS is alphabetical by filename for
 * deterministic builds across operating systems. The store's
 * `sortPersonas` re-sorts by display name before rendering, so the
 * UI order is alphabetical by what the user sees, not by filename.
 */

// Vite glob: relative path from this file (src/features/personas/) up
// to the repo root. eager=true returns the values directly instead of
// lazy promises. query='?raw' tells Vite to inline the file as a
// string literal. import='default' unwraps the default export.
const personaFiles = import.meta.glob<string>('../../../personas/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
})

/**
 * Parses a single .md file into a Persona, or returns null if the
 * file is unusable. Edge cases handled:
 *
 *   - No `# heading`: falls back to a name derived from the filename
 *     (kebab-case → spaces, title-cased). The persona is still loaded
 *     so a user with a personas/ folder of plain prompts (no headings)
 *     gets something usable.
 *
 *   - Empty content: rejected — a persona with no instructions is
 *     not a useful entry. Logs a warning and returns null.
 *
 *   - Empty filename (path with no basename): rejected. Logs a
 *     warning and returns null.
 */
function parseBuiltInFile(filePath: string, content: string): Persona | null {
  const filenameWithExt = filePath.split('/').pop() ?? ''
  const filename = filenameWithExt.replace(/\.md$/i, '')
  if (filename === '') {
    console.warn(`[built-in-personas] file at "${filePath}" has no basename — skipped`)
    return null
  }
  if (content.trim() === '') {
    console.warn(`[built-in-personas] file "${filename}.md" is empty — skipped`)
    return null
  }

  // Pull the first H1 heading as the display name. Tolerant of leading
  // whitespace before the # so files saved with stray indentation
  // still parse correctly.
  const headingMatch = content.match(/^\s*#\s+(.+?)\s*$/m)
  const headingName = headingMatch?.[1]?.trim() ?? ''
  const fallbackName = filename
    .split('-')
    .map((part) => (part.length > 0 ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(' ')
  const name = headingName !== '' ? headingName : fallbackName

  return {
    id: `builtin_${filename}`,
    name,
    // Synthetic path. The renderer never reads from it (built-ins
    // come from the bundle), but it satisfies the Persona shape and
    // distinguishes built-ins from custom personas (which use the
    // `__custom__/` prefix). Matches the convention from the
    // pre-Vite-glob hardcoded array.
    filePath: `__builtin__/${filename}.md`,
    content,
    isBuiltIn: true,
  }
}

function loadBuiltIns(): readonly Persona[] {
  const result: Persona[] = []
  // Sort by file path so the build is deterministic across OSes
  // (filesystem enumeration order varies between Linux, macOS, and
  // Windows). The UI re-sorts by display name in `sortPersonas`,
  // so this ordering is invisible to users — but stable IDs and a
  // stable array order matter for snapshot tests and source diffs.
  const sortedEntries = Object.entries(personaFiles).sort(([a], [b]) =>
    a.localeCompare(b),
  )
  for (const [filePath, content] of sortedEntries) {
    if (typeof content !== 'string') {
      console.warn(`[built-in-personas] glob entry "${filePath}" is not a string — skipped`)
      continue
    }
    const persona = parseBuiltInFile(filePath, content)
    if (persona != null) {
      result.push(persona)
    }
  }
  return result
}

export const BUILT_IN_PERSONAS: readonly Persona[] = loadBuiltIns()
