/**
 * Simple fuzzy matching: checks if all characters of the query appear
 * in order within the target. Returns a score (higher = better match).
 */
export function fuzzyMatch(query: string, target: string): { readonly match: boolean; readonly score: number } {
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  if (q === '') return { match: true, score: 0 }

  let qi = 0
  let score = 0
  let prevMatchIndex = -2

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Bonus for consecutive matches
      score += (ti === prevMatchIndex + 1) ? 2 : 1
      // Bonus for matching at start of word
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '-') score += 1
      prevMatchIndex = ti
      qi++
    }
  }

  return { match: qi === q.length, score }
}
