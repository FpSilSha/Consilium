import type { CompilePreset } from '@/features/chat/compile-presets'

/**
 * Compile Prompts library — adds user-created compile prompts on top
 * of the 5 built-in presets in `src/features/chat/compile-presets.ts`.
 *
 * Design note: the existing `CompilePreset` type already has the exact
 * shape this library needs (id, label, description, prompt). We reuse
 * it verbatim for custom entries so the merged list (base + custom)
 * is homogeneous — the Compile Document dropdown and the Compile
 * Settings modal don't need to care which side of the library an
 * entry comes from.
 *
 * `CustomCompilePrompt` adds only what's needed for disk persistence:
 * createdAt/updatedAt. `isBuiltIn` is not stored here because a
 * custom entry is by definition not built-in; the merged list layer
 * (see resolver) synthesizes the flag when needed for UI rendering.
 */
export interface CustomCompilePrompt extends CompilePreset {
  readonly createdAt: number
  readonly updatedAt: number
}

/**
 * Merged entry type used by the Compile Document dropdown and the
 * Compile Prompts pane. Base entries come from COMPILE_PRESETS with
 * isBuiltIn:true synthesized; custom entries come from the store
 * with isBuiltIn:false.
 */
export interface MergedCompilePrompt extends CompilePreset {
  readonly isBuiltIn: boolean
}
