import type { Message, AdvisorWindow } from '@/types'
import { resolveModelById } from '@/features/modelSelector/model-resolve'
import { estimateTokens } from '@/services/tokenizer/char-estimator'
import { formatWithIdentityHeader } from '@/services/context-bus/identity-headers'

const COMPACTION_THRESHOLD = 0.65 // 65% of context window

/**
 * Estimates the total token count of a message list.
 */
export function estimateThreadTokens(messages: readonly Message[]): number {
  return messages.reduce(
    (total, msg) => total + estimateTokens(formatWithIdentityHeader(msg)),
    0,
  )
}

/**
 * Checks whether a window should trigger automatic compaction.
 */
export function shouldCompact(
  messages: readonly Message[],
  window: AdvisorWindow,
): boolean {
  const model = resolveModelById(window.model)
  if (model === undefined) return false

  const tokenCount = estimateThreadTokens(messages)
  return tokenCount >= model.contextWindow * COMPACTION_THRESHOLD
}

/**
 * Splits the message thread into archive (older messages to summarize)
 * and buffer (recent messages to keep verbatim).
 */
export function splitForCompaction(
  messages: readonly Message[],
  bufferSize: number,
): { readonly archive: readonly Message[]; readonly buffer: readonly Message[] } {
  const effectiveBuffer = Math.min(Math.max(bufferSize, 5), messages.length)
  const splitPoint = messages.length - effectiveBuffer

  if (splitPoint <= 0) {
    return { archive: [], buffer: messages }
  }

  return {
    archive: messages.slice(0, splitPoint),
    buffer: messages.slice(splitPoint),
  }
}

/**
 * Builds a summary prompt for the archive portion.
 * This prompt is sent to a cheap/fast model (e.g., Haiku, GPT-4o-mini)
 * to generate a condensed summary of the older conversation.
 */
export function buildSummaryPrompt(
  archiveMessages: readonly Message[],
): string {
  const formatted = archiveMessages
    .map(formatWithIdentityHeader)
    .join('\n\n')

  return [
    'Summarize the following conversation concisely. Preserve:',
    '- Key decisions and conclusions',
    '- Important facts, numbers, and code snippets',
    '- Who said what (using their persona labels)',
    '- Action items and open questions',
    '',
    'Keep the summary under 500 words. Use the original persona labels in brackets.',
    '',
    '---',
    '',
    formatted,
  ].join('\n')
}

/**
 * Builds the compacted payload that gets sent to an agent:
 * [System Prompt] → [Archive summary] → [Buffer of raw recent messages]
 *
 * Returns the summary as a system-level context preamble and the raw buffer messages.
 */
export function buildCompactedContext(
  archiveSummary: string,
  buffer: readonly Message[],
): { readonly preamble: string; readonly recentMessages: readonly Message[] } {
  const preamble = [
    '--- Conversation History (Summarized) ---',
    '',
    archiveSummary,
    '',
    '--- Recent Messages (Verbatim) ---',
  ].join('\n')

  return { preamble, recentMessages: buffer }
}

/**
 * Returns the percentage of context window used by the current thread.
 */
export function getContextUsagePercent(
  messages: readonly Message[],
  modelId: string,
): number {
  const model = resolveModelById(modelId)
  if (model === undefined) return 0

  const tokens = estimateThreadTokens(messages)
  return Math.min((tokens / model.contextWindow) * 100, 100)
}
