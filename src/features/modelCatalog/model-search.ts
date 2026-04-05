import type { ModelInfo } from '@/types'

/**
 * Token-based model search with scoring.
 *
 * Splits query by spaces into tokens. A model matches if ALL tokens
 * appear (as substrings) in the model's name or id. Results are scored
 * by match quality:
 *   - Exact prefix match on name → highest
 *   - All tokens in name → high
 *   - All tokens in id → medium
 *   - Mixed (some in name, some in id) → lower
 *
 * "gpt mini" matches "GPT-4o Mini" because both "gpt" and "mini" appear.
 * "claude son" matches "Claude Sonnet 4.6" via substring matching.
 */
export function searchModels(models: readonly ModelInfo[], query: string): readonly ModelInfo[] {
  const trimmed = query.trim()
  if (trimmed === '') return models

  const tokens = trimmed.toLowerCase().split(/\s+/).filter((t) => t !== '')
  if (tokens.length === 0) return models

  const scored: { readonly model: ModelInfo; readonly score: number }[] = []

  for (const model of models) {
    const name = model.name.toLowerCase()
    const id = model.id.toLowerCase()

    // Check if all tokens match in name, id, or across both
    let allMatchName = true
    let allMatchId = true
    let allMatchSomewhere = true

    for (const token of tokens) {
      const inName = name.includes(token)
      const inId = id.includes(token)
      if (!inName) allMatchName = false
      if (!inId) allMatchId = false
      if (!inName && !inId) { allMatchSomewhere = false; break }
    }

    if (!allMatchSomewhere) continue

    // Score: higher is better
    let score = 0

    if (allMatchName) {
      score += 100
      // Bonus for prefix match on name (first token at position 0)
      if (name.startsWith(tokens[0]!)) score += 50
      // Bonus for earlier appearance of first token
      score += Math.max(0, 20 - name.indexOf(tokens[0]!))
    } else if (allMatchId) {
      score += 50
      if (id.startsWith(tokens[0]!)) score += 25
    } else {
      // Mixed match — tokens spread across name and id
      score += 25
    }

    scored.push({ model, score })
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => s.model)
}
