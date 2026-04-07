import { useEffect } from 'react'
import { useStore } from '@/store'
import { isValidCustomCompilePromptRow } from '@/features/compilePrompts/compile-prompts-resolver'
import type { CustomCompilePrompt } from '@/features/compilePrompts/types'

/**
 * Loads custom compile prompts from disk at startup and seeds the
 * Zustand store. Matches the pattern of useStartupCustomPersonas /
 * useStartupCustomSystemPrompts: module-scope hasRun guard for Strict
 * Mode, silent-drop warning on invalid rows, non-fatal failure
 * handling.
 *
 * There's no config-reconciliation step here (unlike system prompts).
 * The existing `compilePresetId` in AppConfig is the global default
 * selection; the startup validator in useStartupAutoCompaction
 * already handles unknown preset IDs by falling back to the default.
 * That fallback was previously gated on `isKnownPresetId` checking
 * only the base COMPILE_PRESETS array — with custom prompts now in
 * play, the validator has been relaxed to accept any non-empty
 * string and let runtime resolution handle the lookup (see the
 * updated comment in useStartupAutoCompaction.ts).
 */

let hasRun = false

export function _resetStartupCustomCompilePromptsForTests(): void {
  hasRun = false
}

interface CompilePromptsAPI {
  compilePromptsLoad(): Promise<readonly Record<string, unknown>[]>
}

export function useStartupCustomCompilePrompts(): void {
  const setCustomCompilePrompts = useStore((s) => s.setCustomCompilePrompts)

  useEffect(() => {
    if (hasRun) return
    hasRun = true

    const api = (window as { consiliumAPI?: CompilePromptsAPI }).consiliumAPI
    if (api == null) return

    api
      .compilePromptsLoad()
      .then((rows) => {
        const valid: CustomCompilePrompt[] = []
        for (const row of rows) {
          if (isValidCustomCompilePromptRow(row)) {
            valid.push({
              id: row.id,
              label: row.label,
              description: row.description,
              prompt: row.prompt,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            })
          }
        }
        const dropped = rows.length - valid.length
        if (dropped > 0) {
          console.warn(
            `[startup] dropped ${dropped} invalid custom compile prompt row(s) — fix the file or the next save will permanently remove them`,
          )
        }
        setCustomCompilePrompts(valid)
      })
      .catch((err) => {
        console.error('[startup] failed to load custom compile prompts:', err)
      })
  }, [setCustomCompilePrompts])
}
