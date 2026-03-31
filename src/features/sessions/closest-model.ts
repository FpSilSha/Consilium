import type { ModelInfo } from '@/types'

/**
 * Finds the closest available model to a given model ID.
 *
 * Heuristic: prefer same model family (substring match on the base name),
 * then fall back to the first available model.
 */
export function findClosestModel(
  currentModelId: string,
  availableModels: readonly ModelInfo[],
): string | null {
  if (availableModels.length === 0) return null

  // Extract base family name (strip version/date suffixes)
  // e.g. "claude-sonnet-4-5-20241022" → "claude-sonnet"
  // e.g. "gpt-4o-mini" → "gpt-4o"
  const baseName = extractFamily(currentModelId)

  // Try to find a model in the same family
  const familyMatch = availableModels.find((m) =>
    extractFamily(m.id) === baseName,
  )
  if (familyMatch != null) return familyMatch.id

  // Try substring match on the model name
  const substringMatch = availableModels.find((m) =>
    m.id.includes(baseName) || baseName.includes(extractFamily(m.id)),
  )
  if (substringMatch != null) return substringMatch.id

  // Fall back to first available
  return availableModels[0]!.id
}

/**
 * Extracts the model family from an ID by stripping version numbers,
 * dates, and trailing segments.
 */
function extractFamily(modelId: string): string {
  // Strip provider prefix if present (e.g. "anthropic/claude-sonnet-4.6")
  const stripped = modelId.includes('/') ? modelId.split('/')[1]! : modelId

  // Remove date suffixes (e.g. "-20241022")
  const noDate = stripped.replace(/-\d{8,}$/, '')

  // Remove trailing version numbers (e.g. "-4-5", "-4.6")
  const noVersion = noDate.replace(/-[\d.]+$/, '')

  return noVersion
}
