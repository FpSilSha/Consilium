import { useEffect } from 'react'
import { useStore } from '@/store'
import { isValidStoredCompactPrompt } from '@/features/compactPrompts/compact-prompts-resolver'
import type { CustomCompactPrompt } from '@/features/compactPrompts/types'

/**
 * Loads custom compact prompts from disk at startup AND reconciles
 * the persisted `compactPromptId` selection against the loaded
 * library. Mirrors useStartupCustomSystemPrompts.
 *
 * Two things happen:
 *
 *  1. Read custom-compact-prompts.json via IPC and seed the store.
 *     Invalid rows are silently dropped with a logged warning count
 *     so partial corruption is visible to the dev / user.
 *
 *  2. Read `compactPromptId` from config.json. If the saved selection
 *     references a custom that no longer exists, reset it to the
 *     built-in default + write the correction back to disk — but
 *     ONLY if the customs load succeeded. A transient load failure
 *     would otherwise permanently discard the user's selection (same
 *     safety gate as useStartupCustomSystemPrompts).
 */

let hasRun = false

export function _resetStartupCustomCompactPromptsForTests(): void {
  hasRun = false
}

interface CompactPromptsAPI {
  compactPromptsLoad(): Promise<readonly Record<string, unknown>[]>
}

interface ConfigAPI {
  configLoad(): Promise<{ values: Record<string, unknown>; descriptions: Record<string, string> }>
  configSave(config: Record<string, unknown>): Promise<void>
}

const BUILT_IN_ID = 'builtin_compact_default'

export function useStartupCustomCompactPrompts(): void {
  const setCustomCompactPrompts = useStore((s) => s.setCustomCompactPrompts)
  const setCompactPromptId = useStore((s) => s.setCompactPromptId)

  useEffect(() => {
    if (hasRun) return
    hasRun = true

    const api = (window as { consiliumAPI?: CompactPromptsAPI & ConfigAPI }).consiliumAPI
    if (api == null) return

    void (async (): Promise<void> => {
      let customs: CustomCompactPrompt[] = []
      let loadSucceeded = false
      try {
        const rows = await api.compactPromptsLoad()
        for (const row of rows) {
          if (isValidStoredCompactPrompt(row)) {
            customs.push({
              id: row.id,
              name: row.name,
              content: row.content,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            })
          }
        }
        const dropped = rows.length - customs.length
        if (dropped > 0) {
          console.warn(
            `[startup] dropped ${dropped} invalid custom compact prompt row(s) — fix the file or the next save will permanently remove them`,
          )
        }
        setCustomCompactPrompts(customs)
        loadSucceeded = true
      } catch (err) {
        console.error('[startup] failed to load custom compact prompts:', err)
      }

      // Reconcile config.json.compactPromptId against the loaded
      // library. A stale id → base fallback → disk rewrite, but only
      // when the load succeeded (see useStartupCustomSystemPrompts
      // for the reasoning on the load-succeeded gate).
      try {
        const { values } = await api.configLoad()
        const rawId = values['compactPromptId']
        if (typeof rawId !== 'string' || rawId === '') {
          // Missing/empty → default, no disk clear needed (config load
          // will pad with the default on next call).
          setCompactPromptId(BUILT_IN_ID)
          return
        }
        // Check whether rawId resolves to a known entry.
        const known = rawId === BUILT_IN_ID || customs.some((c) => c.id === rawId)
        if (known) {
          setCompactPromptId(rawId)
          return
        }
        // Unknown id. Apply the in-memory fallback so the current
        // session behaves correctly.
        setCompactPromptId(BUILT_IN_ID)
        // Only persist the correction back to disk if the library
        // load actually succeeded. On transient I/O failure, leaving
        // disk alone lets the NEXT launch (with a successful load)
        // see the user's original selection and reconcile correctly.
        if (loadSucceeded) {
          const nextValues = { ...values, compactPromptId: BUILT_IN_ID }
          await api.configSave(nextValues).catch((err) => {
            console.error('[startup] failed to persist reconciled compactPromptId:', err)
          })
        }
      } catch (err) {
        console.error('[startup] failed to reconcile compactPromptId:', err)
      }
    })()
  }, [setCustomCompactPrompts, setCompactPromptId])
}
