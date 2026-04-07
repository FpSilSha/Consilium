import { COMPILE_PRESETS, DEFAULT_PRESET_ID, type CompilePreset } from '@/features/chat/compile-presets'
import type { CustomCompilePrompt, MergedCompilePrompt } from './types'

/**
 * Pure resolution helpers for the Compile Prompts library.
 *
 * The library has two layers:
 *
 *   - BASE:    COMPILE_PRESETS from compile-presets.ts (5 hardcoded
 *              entries — Comprehensive Report, Brief Summary, Meeting
 *              Minutes, Essay, Q&A Digest). Shipped with the app,
 *              read-only at runtime.
 *
 *   - CUSTOM:  User-created entries persisted to
 *              {userData}/custom-compile-prompts.json and loaded into
 *              the Zustand store at startup.
 *
 * Consumers (CompileDocumentButton dropdown, CompileSettingsModal
 * dropdown, DocumentsPanel label lookup) call into this resolver
 * rather than reading COMPILE_PRESETS directly. Keeping the resolver
 * pure — taking `customs` as an argument rather than reading from
 * the store — means these functions are unit-testable without React
 * or Zustand.
 *
 * Back-compat: the existing `getPresetById` in compile-presets.ts is
 * left intact for callers that only need base resolution. New callers
 * that may receive custom IDs use `resolveCompilePrompt` here.
 */

/**
 * Returns the merged list of all compile prompts (base + custom),
 * with `isBuiltIn` synthesized on each entry so the UI can render
 * a "base" badge on the built-in ones.
 *
 * Base entries always come first in the list so the built-in order
 * (Comprehensive Report, Brief Summary, Meeting Minutes, Essay, Q&A
 * Digest) is preserved at the top of the dropdown. Custom entries
 * follow in their natural array order.
 */
export function getMergedCompilePrompts(
  customs: readonly CustomCompilePrompt[],
): readonly MergedCompilePrompt[] {
  const base: MergedCompilePrompt[] = COMPILE_PRESETS.map((p) => ({ ...p, isBuiltIn: true }))
  const customMerged: MergedCompilePrompt[] = customs.map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    prompt: c.prompt,
    isBuiltIn: false,
  }))
  return [...base, ...customMerged]
}

/**
 * Looks up a compile prompt by id across both base and custom entries.
 * Returns null if the id is unknown — callers are expected to fall
 * back gracefully (e.g., to DEFAULT_PRESET_ID via
 * `resolveCompilePromptWithFallback`).
 */
export function resolveCompilePrompt(
  id: string,
  customs: readonly CustomCompilePrompt[],
): MergedCompilePrompt | null {
  const merged = getMergedCompilePrompts(customs)
  return merged.find((p) => p.id === id) ?? null
}

/**
 * Same as `resolveCompilePrompt` but never returns null — falls back
 * to the default preset (Comprehensive Report). Used by
 * CompileDocumentButton and CompileSettingsModal where a null
 * resolution would crash the UI.
 */
export function resolveCompilePromptWithFallback(
  id: string,
  customs: readonly CustomCompilePrompt[],
): MergedCompilePrompt {
  const found = resolveCompilePrompt(id, customs)
  if (found != null) return found
  const fallback = resolveCompilePrompt(DEFAULT_PRESET_ID, customs)
  if (fallback != null) return fallback
  // Unreachable: DEFAULT_PRESET_ID is hardcoded to 'comprehensive'
  // and COMPILE_PRESETS is a frozen const that includes it. If we
  // ever get here, the compile-presets module itself is broken.
  throw new Error(`[compile-prompts] default preset ${DEFAULT_PRESET_ID} not found in COMPILE_PRESETS`)
}

/**
 * Type guard for persisted disk rows. Validates the shape of a single
 * row from custom-compile-prompts.json. Used by both the main-process
 * validator and the renderer-side startup loader to drop corrupt rows
 * without losing the whole file.
 */
export function isValidCustomCompilePromptRow(entry: unknown): entry is {
  id: string
  label: string
  description: string
  prompt: string
  createdAt: number
  updatedAt: number
} {
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

/**
 * Used by test fixtures. Re-exports the CompilePreset shape for
 * convenience so tests can build Merged entries from scratch.
 */
export type { CompilePreset }
