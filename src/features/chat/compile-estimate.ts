/**
 * Pure token-estimate helpers for the Compile Document button.
 *
 * Extracted from the component file so:
 *   - The constants + helper are not buried in a .tsx file
 *   - Tests can import without pulling in React
 *   - Future consumers (e.g., a CLI or separate UI) can reuse the same math
 *
 * The whole point of these helpers is to lean HIGH on the token estimate.
 * Users should NEVER see a "safe" number that then fails the actual API
 * call. Overestimating means the warning thresholds fire slightly early,
 * which is the desired behavior.
 */

/**
 * Fixed token overhead for a compile API call that is NOT captured by
 * `estimateThreadTokens(messages)`. Accounts for:
 *   - The system prompt ("You are a document compiler...")
 *   - The DEFAULT_COMPILE_PROMPT appended as a final user message
 *   - Per-message API wrapper overhead (role tags, JSON envelope)
 *   - Small headroom for tokenizer variance
 *
 * Sized at ~300 because:
 *   - DEFAULT_COMPILE_PROMPT ≈ 130–150 tokens
 *   - System prompt ≈ 12 tokens
 *   - Per-message envelope ≈ 3–5 tokens × ~20 messages ≈ 100 tokens
 *   - Plus small safety buffer
 */
export const COMPILE_OVERHEAD_TOKENS = 300

/**
 * Conservative safety multiplier on the thread token estimate. The base
 * char-estimator uses ~4 chars/token which matches average English prose
 * but underestimates:
 *   - Code (~3 chars/token) by ~33%
 *   - CJK / Unicode-heavy (~2 chars/token) by ~100%
 *
 * A 1.5x multiplier covers code comfortably and most Unicode content,
 * at the cost of over-warning on pure-prose sessions (where the real
 * usage will be ~67% of the displayed number). That tradeoff is
 * intentional: false alarms make users pick a bigger model, false
 * "safe" signals cause real API failures.
 */
export const CONSERVATIVE_ESTIMATE_MULTIPLIER = 1.5

/**
 * Pure token-estimate calculator for compile operations. Given a raw
 * thread token count and optional focus-prompt token count, returns the
 * conservative input-token estimate that the compile picker uses to
 * decide whether to warn/disable the selected model.
 *
 * Formula:
 *   ceil(threadTokens × CONSERVATIVE_ESTIMATE_MULTIPLIER)
 *   + COMPILE_OVERHEAD_TOKENS
 *   + userFocusTokens
 *
 * The multiplier is applied only to the thread portion because the
 * overhead is a fixed constant that already accounts for its own wrapper
 * cost, and the user's focus prompt is counted as-is (it's short enough
 * that the multiplier adds little value there).
 */
export function computeConservativeCompileEstimate(
  threadTokens: number,
  userFocusTokens: number,
): number {
  return Math.ceil(threadTokens * CONSERVATIVE_ESTIMATE_MULTIPLIER)
    + COMPILE_OVERHEAD_TOKENS
    + userFocusTokens
}
