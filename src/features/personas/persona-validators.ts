import type { Persona } from '@/types'

/**
 * Pure validation + ID generation helpers for the custom-persona create
 * flow. Lives in its own module so it can be unit-tested without spinning
 * up React or the Electron IPC bridge.
 *
 * The renderer is the OWNER of these limits — the main process accepts
 * whatever the renderer sends and only enforces structural validity (see
 * `electron/main/persona-store.ts`). If a future feature ever bypasses
 * the renderer (e.g., a CLI or import flow), it should call into these
 * same helpers to stay consistent.
 */

/** Hard cap on a custom persona's display name. */
export const MAX_PERSONA_NAME_LENGTH = 30

/** Minimum allowed name length after trimming. Empty names are rejected. */
export const MIN_PERSONA_NAME_LENGTH = 1

/**
 * Maximum allowed length of a custom persona's content body. This is
 * intentionally generous — personas are part of the system prompt and
 * users may want to encode rich behavioral instructions — but a hard
 * upper bound prevents pathological pastes from blowing up the system
 * prompt budget on every API call.
 *
 * 8000 characters at ~4 chars/token = ~2000 tokens, which is a
 * reasonable ceiling for one persona. The advisor system prompt also
 * includes the layer-1 base instructions (~800 tokens) plus any session
 * instructions, so total system prompt budget stays under ~3000 tokens
 * even for a maximally-long persona.
 */
export const MAX_PERSONA_CONTENT_LENGTH = 8000

export interface PersonaValidationError {
  readonly field: 'name' | 'content'
  readonly message: string
}

/**
 * Validates a name + content pair from the persona create form. Returns
 * an array of errors (empty if valid). Multiple errors are returned in a
 * single call so the form can highlight every issue at once rather than
 * making the user fix one at a time.
 */
export function validatePersonaInput(name: string, content: string): readonly PersonaValidationError[] {
  const errors: PersonaValidationError[] = []
  const trimmedName = name.trim()

  if (trimmedName.length < MIN_PERSONA_NAME_LENGTH) {
    errors.push({ field: 'name', message: 'Name is required.' })
  } else if (trimmedName.length > MAX_PERSONA_NAME_LENGTH) {
    errors.push({
      field: 'name',
      message: `Name must be ${MAX_PERSONA_NAME_LENGTH} characters or fewer.`,
    })
  }

  // Content can be empty (interpreted as "no special instructions"), but
  // not pathologically large.
  if (content.length > MAX_PERSONA_CONTENT_LENGTH) {
    errors.push({
      field: 'content',
      message: `Content must be ${MAX_PERSONA_CONTENT_LENGTH.toLocaleString()} characters or fewer.`,
    })
  }

  return errors
}

/**
 * Generates a stable, collision-resistant ID for a new custom persona.
 *
 * Format: `custom_{slug}_{timestampSuffix}`
 *
 *   - `custom_` prefix distinguishes custom personas from built-ins
 *     (which use `builtin_*`) at a glance — useful when grepping logs or
 *     reading session JSON.
 *
 *   - `slug` is the lowercased name with non-alphanumerics replaced by
 *     hyphens, capped to 24 chars. The slug makes IDs human-readable
 *     when they appear in advisor windows or session files.
 *
 *   - `timestampSuffix` is the last 6 digits of the current epoch ms.
 *
 * Collision behavior — important to understand:
 *
 *   - Two personas created with DIFFERENT names in the same millisecond
 *     differ by slug. Safe.
 *
 *   - Two personas created with the SAME name in different milliseconds
 *     differ by suffix. Safe (until the suffix wraps every ~17 minutes,
 *     which is well outside any realistic create cadence).
 *
 *   - Two personas created with the SAME name in the SAME millisecond
 *     COLLIDE. This is essentially impossible via human input but is
 *     reachable in tight test loops.
 *
 *   - Names that produce an EMPTY slug (all-Unicode names like "测试",
 *     emoji-only names, etc.) all share the same `persona` fallback
 *     slug. To avoid the collision case for these specifically, we mix
 *     in a 4-char random suffix when the slug fell back to "persona" —
 *     the random component differentiates two emoji personas created in
 *     the same millisecond.
 *
 * The ID is generated once at create time and persists across renames —
 * renaming a persona does NOT regenerate its ID, so advisor windows that
 * reference the old slug-based ID continue to resolve correctly. The
 * slug in the ID is therefore a creation-time hint, not a live label.
 *
 * Test seam: pass `now` and `randomSeed` to make the output deterministic.
 */
export function generateCustomPersonaId(
  name: string,
  now: number = Date.now(),
  randomSeed?: string,
): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  const slugIsFallback = slug.length === 0
  const fallbackSlug = slugIsFallback ? 'persona' : slug
  const timestampSuffix = String(now).slice(-6)
  // Only mix in randomness when the slug had nothing to differentiate
  // by — keeps deterministic IDs for the common ASCII case while
  // protecting the all-Unicode/emoji edge case.
  if (slugIsFallback) {
    const random = randomSeed ?? Math.random().toString(36).slice(2, 6)
    return `custom_${fallbackSlug}_${timestampSuffix}_${random}`
  }
  return `custom_${fallbackSlug}_${timestampSuffix}`
}

/**
 * Synthesizes a Persona object from a stored custom-persona row. Custom
 * personas don't have a real .md file on disk, so `filePath` is a
 * synthetic marker (`__custom__/{id}.md`) that the rest of the app can
 * treat uniformly via the existing Persona interface.
 *
 * The synthetic path is intentionally invalid (the `__custom__/` prefix
 * matches the `__builtin__/` prefix used by `built-in-personas.ts` for
 * the same reason) so any code that tries to actually read it from disk
 * fails fast rather than silently mis-resolving to a real file.
 */
export function toPersona(stored: { id: string; name: string; content: string }): Persona {
  return {
    id: stored.id,
    name: stored.name,
    filePath: `__custom__/${stored.id}.md`,
    content: stored.content,
    isBuiltIn: false,
  }
}
