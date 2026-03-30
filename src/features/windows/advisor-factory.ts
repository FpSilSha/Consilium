import { v4 as uuidv4 } from 'uuid'
import type { AdvisorWindow, ApiKey, Persona } from '@/types'
import { getAccentColor, BUILT_IN_THEMES } from '@/features/themes'

export const DEFAULT_MODEL_ID = 'claude-sonnet-4-6' as const

/**
 * Creates a new AdvisorWindow with sensible defaults.
 * Single source of truth for advisor creation across the app.
 */
export function createDefaultAdvisorWindow(
  windowOrder: readonly string[],
  personas: readonly Persona[],
  keys: readonly ApiKey[],
): AdvisorWindow {
  const defaultTheme = BUILT_IN_THEMES[0]!
  const accentColor = getAccentColor(
    windowOrder.length,
    defaultTheme.colors.accentPalette,
  )

  const firstPersona = personas[0]
  const firstKey = keys[0]

  return {
    id: uuidv4(),
    provider: firstKey?.provider ?? 'anthropic',
    keyId: firstKey?.id ?? '',
    model: DEFAULT_MODEL_ID,
    personaId: firstPersona?.id ?? '',
    personaLabel: firstPersona?.name ?? 'Advisor',
    accentColor,
    runningCost: 0,
    isStreaming: false,
    streamContent: '',
    error: null,
    isCompacted: false,
    compactedSummary: null,
    bufferSize: 15,
  }
}
