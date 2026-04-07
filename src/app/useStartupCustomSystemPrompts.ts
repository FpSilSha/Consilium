import { useEffect } from 'react'
import { useStore } from '@/store'
import type { SystemPromptEntry, SystemPromptsState } from '@/features/systemPrompts/types'
import {
  DEFAULT_SYSTEM_PROMPTS_STATE,
  isValidSystemPromptsState,
} from '@/features/systemPrompts/system-prompt-resolver'

/**
 * Loads custom system prompts from disk AND reconciles the persisted
 * SystemPromptsState against the loaded library. Runs once on app
 * boot, alongside the other startup hooks.
 *
 * Two things happen here:
 *
 *  1. The custom-system-prompts.json file is read via
 *     consiliumAPI.systemPromptsLoad() and the rows are seeded into
 *     the Zustand store. Invalid rows are silently dropped; the
 *     count is logged so the user has a signal that the file needs
 *     attention before a subsequent save permanently removes them.
 *
 *  2. The current SystemPromptsState is read from config.json, its
 *     customId fields are validated against the loaded library, and
 *     any references to missing customs are rewritten back to
 *     `base` + `null` on disk. This matches the self-healing pattern
 *     from useStartupAutoCompaction (and from the existing compile
 *     preset validator) — stale config is corrected on the first
 *     launch after a custom is deleted, with the rest of the app
 *     seeing consistent state immediately.
 *
 * Failures are non-fatal: if the disk read throws or the config is
 * unparseable, the store keeps its default state and the feature
 * still works (every mode falls back to base). The error is logged
 * to console so devs can spot it.
 */

let hasRun = false

export function _resetStartupCustomSystemPromptsForTests(): void {
  hasRun = false
}

interface SystemPromptsAPI {
  systemPromptsLoad(): Promise<readonly Record<string, unknown>[]>
}

interface ConfigAPI {
  configLoad(): Promise<{ values: Record<string, unknown>; descriptions: Record<string, string> }>
  configSave(config: Record<string, unknown>): Promise<void>
}

export function useStartupCustomSystemPrompts(): void {
  const setCustomSystemPrompts = useStore((s) => s.setCustomSystemPrompts)
  const setSystemPromptsConfig = useStore((s) => s.setSystemPromptsConfig)

  useEffect(() => {
    if (hasRun) return
    hasRun = true

    const api = (window as {
      consiliumAPI?: SystemPromptsAPI & ConfigAPI
    }).consiliumAPI
    if (api == null) return

    void (async (): Promise<void> => {
      // Load the custom prompts library from disk first — the config
      // reconciliation step below needs the loaded IDs to validate
      // the persisted customId references.
      let customs: SystemPromptEntry[] = []
      try {
        const rows = await api.systemPromptsLoad()
        const valid = rows.filter(
          (r): r is {
            id: string
            category: 'advisor' | 'persona-switch'
            name: string
            content: string
          } =>
            typeof r['id'] === 'string' &&
            (r['category'] === 'advisor' || r['category'] === 'persona-switch') &&
            typeof r['name'] === 'string' &&
            typeof r['content'] === 'string',
        )
        const dropped = rows.length - valid.length
        if (dropped > 0) {
          console.warn(
            `[startup] dropped ${dropped} invalid custom system prompt row(s) — fix the file or the next save will permanently remove them`,
          )
        }
        customs = valid.map((row) => ({
          id: row.id,
          category: row.category,
          name: row.name,
          content: row.content,
          isBuiltIn: false,
        }))
        setCustomSystemPrompts(customs)
      } catch (err) {
        console.error('[startup] failed to load custom system prompts:', err)
      }

      // Now reconcile config.json against the loaded library.
      try {
        const { values } = await api.configLoad()
        const persisted: SystemPromptsState = {
          advisorMode: typeof values['advisorSystemPromptMode'] === 'string'
            ? (values['advisorSystemPromptMode'] as 'base' | 'custom' | 'off')
            : DEFAULT_SYSTEM_PROMPTS_STATE.advisorMode,
          advisorCustomId: values['advisorSystemPromptCustomId'] === null
            ? null
            : typeof values['advisorSystemPromptCustomId'] === 'string'
              ? values['advisorSystemPromptCustomId']
              : null,
          personaSwitchMode: typeof values['personaSwitchPromptMode'] === 'string'
            ? (values['personaSwitchPromptMode'] as 'base' | 'custom' | 'off')
            : DEFAULT_SYSTEM_PROMPTS_STATE.personaSwitchMode,
          personaSwitchCustomId: values['personaSwitchPromptCustomId'] === null
            ? null
            : typeof values['personaSwitchPromptCustomId'] === 'string'
              ? values['personaSwitchPromptCustomId']
              : null,
        }

        if (!isValidSystemPromptsState(persisted)) {
          setSystemPromptsConfig(DEFAULT_SYSTEM_PROMPTS_STATE)
          return
        }

        // Reconcile customIds against the loaded library. If the
        // user's config points to a custom that was deleted or
        // renamed, reset that category to base/null. This matches
        // the self-healing done by the compile preset validator.
        const reconciled = reconcile(persisted, customs)
        setSystemPromptsConfig(reconciled)

        // Only write back to disk if something actually changed.
        const configChanged =
          reconciled.advisorMode !== persisted.advisorMode ||
          reconciled.advisorCustomId !== persisted.advisorCustomId ||
          reconciled.personaSwitchMode !== persisted.personaSwitchMode ||
          reconciled.personaSwitchCustomId !== persisted.personaSwitchCustomId
        if (configChanged) {
          const nextValues = {
            ...values,
            advisorSystemPromptMode: reconciled.advisorMode,
            advisorSystemPromptCustomId: reconciled.advisorCustomId,
            personaSwitchPromptMode: reconciled.personaSwitchMode,
            personaSwitchPromptCustomId: reconciled.personaSwitchCustomId,
          }
          await api.configSave(nextValues).catch((err) => {
            console.error('[startup] failed to persist reconciled system prompts config:', err)
          })
        }
      } catch (err) {
        console.error('[startup] failed to reconcile system prompts config:', err)
      }
    })()
  }, [setCustomSystemPrompts, setSystemPromptsConfig])
}

/**
 * Reconciles the persisted SystemPromptsState against the loaded
 * custom library. If a category's mode is 'custom' but its customId
 * doesn't match any loaded entry (or matches an entry of the wrong
 * category), reset that category to base/null.
 *
 * Exported for unit testing.
 */
export function reconcile(
  persisted: SystemPromptsState,
  customs: readonly SystemPromptEntry[],
): SystemPromptsState {
  let advisorMode = persisted.advisorMode
  let advisorCustomId = persisted.advisorCustomId
  if (persisted.advisorMode === 'custom') {
    const found = customs.find(
      (c) => c.id === persisted.advisorCustomId && c.category === 'advisor',
    )
    if (found == null) {
      advisorMode = 'base'
      advisorCustomId = null
    }
  }

  let personaSwitchMode = persisted.personaSwitchMode
  let personaSwitchCustomId = persisted.personaSwitchCustomId
  if (persisted.personaSwitchMode === 'custom') {
    const found = customs.find(
      (c) => c.id === persisted.personaSwitchCustomId && c.category === 'persona-switch',
    )
    if (found == null) {
      personaSwitchMode = 'base'
      personaSwitchCustomId = null
    }
  }

  return { advisorMode, advisorCustomId, personaSwitchMode, personaSwitchCustomId }
}
