/**
 * Character-based token estimation fallback.
 * Uses the ~4 characters per token approximation.
 * This is used for providers without a public tokenizer library.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Estimates the cost of a message based on character count.
 */
export function estimateCost(
  text: string,
  pricePerToken: number,
): number {
  return estimateTokens(text) * pricePerToken
}

/**
 * Estimates the cost of a full API call (input + output).
 */
export function estimateCallCost(
  inputText: string,
  outputText: string,
  inputPricePerToken: number,
  outputPricePerToken: number,
): number {
  const inputCost = estimateCost(inputText, inputPricePerToken)
  const outputCost = estimateCost(outputText, outputPricePerToken)
  return inputCost + outputCost
}
