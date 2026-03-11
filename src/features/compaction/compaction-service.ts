import type { Message, AdvisorWindow } from '@/types'
import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import { getRawKey } from '@/features/keys/key-vault'
import {
  splitForCompaction,
  buildSummaryPrompt,
  shouldCompact,
} from './compaction-engine'

/**
 * The cheap/fast model used for summarization.
 * Falls back through available providers.
 */
const SUMMARY_MODELS = [
  { provider: 'anthropic' as const, model: 'claude-haiku-4-5-20251001' },
  { provider: 'openai' as const, model: 'gpt-4o-mini' },
  { provider: 'google' as const, model: 'gemini-2.0-flash' },
] as const

interface CompactionResult {
  readonly archiveSummary: string
  readonly archivedCount: number
  readonly bufferCount: number
}

/**
 * Runs compaction for a specific window.
 * Summarizes older messages, archives them, and marks the window as compacted.
 */
export async function compactWindow(
  windowId: string,
): Promise<CompactionResult | null> {
  const state = useStore.getState()
  const window = state.windows[windowId]
  if (window === undefined) return null

  const { archive, buffer } = splitForCompaction(
    state.messages,
    window.bufferSize,
  )

  if (archive.length === 0) return null

  // Find a suitable summary model with an available key
  const summaryConfig = findSummaryModel(state.keys)
  if (summaryConfig === null) {
    // Fallback: create a basic summary without API call
    return createFallbackSummary(archive, buffer, windowId)
  }

  const summaryPrompt = buildSummaryPrompt(archive)

  try {
    const summary = await runSummarization(
      summaryConfig.provider,
      summaryConfig.model,
      summaryConfig.apiKey,
      summaryPrompt,
    )

    applyCompaction(windowId, archive, buffer, summary)

    return {
      archiveSummary: summary,
      archivedCount: archive.length,
      bufferCount: buffer.length,
    }
  } catch {
    return createFallbackSummary(archive, buffer, windowId)
  }
}

/** Tracks windows currently being compacted to prevent duplicate jobs. */
const compactingWindows = new Set<string>()

/**
 * Checks all windows and triggers compaction for any that need it.
 * Guards against duplicate in-flight compaction jobs per window.
 */
export function checkAutoCompaction(): void {
  const state = useStore.getState()

  for (const windowId of state.windowOrder) {
    if (compactingWindows.has(windowId)) continue

    const window = state.windows[windowId]
    if (window === undefined || window.isStreaming) continue

    if (shouldCompact(state.messages, window)) {
      compactingWindows.add(windowId)
      compactWindow(windowId)
        .catch(() => {
          // Auto-compaction failures are non-fatal
        })
        .finally(() => {
          compactingWindows.delete(windowId)
        })
    }
  }
}

/**
 * Compacts the main shared thread. This is user-triggered and affects all windows.
 */
export async function compactMainThread(): Promise<CompactionResult | null> {
  const state = useStore.getState()

  // Use the smallest buffer size among all windows
  const minBuffer = state.windowOrder.reduce((min, id) => {
    const w = state.windows[id]
    return w !== undefined ? Math.min(min, w.bufferSize) : min
  }, 15)

  const { archive, buffer } = splitForCompaction(state.messages, minBuffer)
  if (archive.length === 0) return null

  const summaryConfig = findSummaryModel(state.keys)

  let summary: string
  if (summaryConfig !== null) {
    try {
      const prompt = buildSummaryPrompt(archive)
      summary = await runSummarization(
        summaryConfig.provider,
        summaryConfig.model,
        summaryConfig.apiKey,
        prompt,
      )
    } catch {
      summary = buildFallbackSummaryText(archive)
    }
  } else {
    summary = buildFallbackSummaryText(archive)
  }

  // Archive old messages, replace thread with summary + buffer
  state.archiveMessages(archive)
  state.setMessages(buffer)

  // Mark all windows as compacted
  for (const windowId of state.windowOrder) {
    state.updateWindow(windowId, { isCompacted: true })
  }

  return {
    archiveSummary: summary,
    archivedCount: archive.length,
    bufferCount: buffer.length,
  }
}

function findSummaryModel(
  keys: readonly { readonly id: string; readonly provider: string }[],
): { provider: string; model: string; apiKey: string } | null {
  for (const candidate of SUMMARY_MODELS) {
    const key = keys.find((k) => k.provider === candidate.provider)
    if (key !== undefined) {
      const rawKey = getRawKey(key.id)
      if (rawKey !== null) {
        return { provider: candidate.provider, model: candidate.model, apiKey: rawKey }
      }
    }
  }
  return null
}

function runSummarization(
  provider: string,
  model: string,
  apiKey: string,
  prompt: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let content = ''
    streamResponse(
      {
        provider: provider as 'anthropic' | 'openai' | 'google' | 'xai' | 'deepseek',
        model,
        apiKey,
        systemPrompt: 'You are a conversation summarizer. Be concise and accurate.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 1024,
      },
      {
        onChunk: (chunk) => { content += chunk },
        onDone: (fullContent) => { resolve(fullContent) },
        onError: (error) => { reject(new Error(error)) },
      },
    )
  })
}

function applyCompaction(
  windowId: string,
  archive: readonly Message[],
  buffer: readonly Message[],
  summary: string,
): void {
  const state = useStore.getState()
  state.archiveMessages(archive)
  state.setMessages(buffer)
  state.updateWindow(windowId, { isCompacted: true, compactedSummary: summary })
}

function createFallbackSummary(
  archive: readonly Message[],
  buffer: readonly Message[],
  windowId: string,
): CompactionResult {
  const summary = buildFallbackSummaryText(archive)
  applyCompaction(windowId, archive, buffer, summary)

  return {
    archiveSummary: summary,
    archivedCount: archive.length,
    bufferCount: buffer.length,
  }
}

function buildFallbackSummaryText(archive: readonly Message[]): string {
  const speakers = [...new Set(archive.map((m) => m.personaLabel))]
  const firstMsg = archive[0]
  const lastMsg = archive[archive.length - 1]

  return [
    `[Conversation summary: ${archive.length} messages archived]`,
    `Participants: ${speakers.join(', ')}`,
    firstMsg !== undefined ? `Started with: "${firstMsg.content.slice(0, 100)}..."` : '',
    lastMsg !== undefined ? `Last archived: "${lastMsg.content.slice(0, 100)}..."` : '',
  ].filter(Boolean).join('\n')
}
