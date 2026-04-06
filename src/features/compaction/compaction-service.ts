import type { Message, AdvisorWindow } from '@/types'
import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import { createAssistantMessage } from '@/services/context-bus/message-factory'
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
 * Guards against concurrent compaction for the same window.
 */
export async function compactWindow(
  windowId: string,
): Promise<CompactionResult | null> {
  if (compactingWindows.has(windowId)) return null
  compactingWindows.add(windowId)

  try {
    return await executeWindowCompaction(windowId)
  } finally {
    compactingWindows.delete(windowId)
  }
}

async function executeWindowCompaction(
  windowId: string,
): Promise<CompactionResult | null> {
  const state = useStore.getState()
  const window = state.windows[windowId]
  if (window === undefined) return null

  // Find a suitable summary model with an available key
  const summaryConfig = findSummaryModel(state.keys)
  if (summaryConfig === null) {
    // No API key available — createFallbackSummary reads live state internally
    return createFallbackSummary(windowId)
  }

  // Only compute archive for the API summarization path
  const { archive } = splitForCompaction(state.messages, window.bufferSize)
  if (archive.length === 0) return null

  const summaryPrompt = buildSummaryPrompt(archive)

  try {
    const summary = await runSummarization(
      summaryConfig.provider,
      summaryConfig.model,
      summaryConfig.apiKey,
      summaryPrompt,
    )

    // Re-split from live state to avoid dropping messages appended during summarization
    const liveState = useStore.getState()
    const liveWindow = liveState.windows[windowId]
    if (liveWindow === undefined) return null

    const { archive: liveArchive, buffer: liveBuffer } = splitForCompaction(
      liveState.messages,
      liveWindow.bufferSize,
    )

    if (liveArchive.length === 0) return null

    applyCompaction(windowId, liveArchive, liveBuffer, summary)

    return {
      archiveSummary: summary,
      archivedCount: liveArchive.length,
      bufferCount: liveBuffer.length,
    }
  } catch {
    return createFallbackSummary(windowId)
  }
}

/** Tracks windows currently being compacted to prevent duplicate jobs. */
const compactingWindows = new Set<string>()

/** Prevents concurrent main thread compaction from double-archiving. */
let isCompactingMainThread = false

/**
 * How many recent messages a manual main-thread compaction keeps verbatim.
 *
 * This is intentionally smaller than the per-advisor `bufferSize` (default 15)
 * used by automatic compaction. Auto-compaction is preventative — it fires near
 * the context limit and wants to keep enough recent context to be transparent.
 * Manual compaction is the user explicitly saying "free space NOW", so we keep
 * a tighter buffer to make sure the action visibly archives something.
 */
export const MANUAL_COMPACTION_BUFFER = 6

/**
 * Checks all windows and triggers compaction for any that need it.
 * Guards against duplicate in-flight compaction jobs per window.
 */
export function checkAutoCompaction(): void {
  const state = useStore.getState()

  for (const windowId of state.windowOrder) {
    const window = state.windows[windowId]
    if (window === undefined || window.isStreaming) continue

    if (shouldCompact(state.messages, window)) {
      compactWindow(windowId).catch(() => {
        // Auto-compaction failures are non-fatal
      })
    }
  }
}

/**
 * Compacts the main shared thread. This is user-triggered and affects all windows.
 * Requires a model to perform the LLM summarization.
 */
export async function compactMainThread(
  provider: string,
  model: string,
  apiKey: string,
): Promise<CompactionResult | null> {
  if (isCompactingMainThread) return null
  isCompactingMainThread = true

  try {
    return await executeMainThreadCompaction(provider, model, apiKey)
  } finally {
    isCompactingMainThread = false
  }
}

async function executeMainThreadCompaction(
  provider: string,
  model: string,
  apiKey: string,
): Promise<CompactionResult | null> {
  const state = useStore.getState()

  // Manual compaction uses an aggressive buffer — the user explicitly clicked
  // "Compact" and expects the action to actually free space. Auto compaction
  // uses each window's larger bufferSize for preventative trims.
  const { archive } = splitForCompaction(state.messages, MANUAL_COMPACTION_BUFFER)
  if (archive.length === 0) return null

  const prompt = buildSummaryPrompt(archive)
  const summary = await runSummarization(provider, model, apiKey, prompt)

  // Re-split from live state to avoid dropping messages appended during summarization
  const liveState = useStore.getState()
  const { archive: liveArchive, buffer: liveBuffer } = splitForCompaction(
    liveState.messages,
    MANUAL_COMPACTION_BUFFER,
  )

  if (liveArchive.length === 0) return null

  // Create a summary message as assistant role with 'System' persona.
  // Models will see it as [System]: [Conversation Summary]... in the thread.
  const summaryMessage = createAssistantMessage(
    `[Conversation Summary]\n\n${summary}`,
    'System',
    'system-compaction',
  )

  // Atomically archive old messages and replace thread with summary + buffer
  liveState.compactMessages(liveArchive, [summaryMessage, ...liveBuffer])

  // Mark all windows as compacted
  for (const windowId of liveState.windowOrder) {
    liveState.updateWindow(windowId, { isCompacted: true })
  }

  return {
    archiveSummary: summary,
    archivedCount: liveArchive.length,
    bufferCount: liveBuffer.length,
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

const SUMMARIZATION_TIMEOUT_MS = 60_000

function runSummarization(
  provider: string,
  model: string,
  apiKey: string,
  prompt: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let controller: AbortController | null = null

    const timeoutId = setTimeout(() => {
      controller?.abort()
      reject(new Error('Summarization timed out after 60 seconds'))
    }, SUMMARIZATION_TIMEOUT_MS)

    try {
      controller = streamResponse(
        {
          provider: provider as 'anthropic' | 'openai' | 'google' | 'xai' | 'deepseek',
          model,
          apiKey,
          systemPrompt: 'You are a conversation summarizer. Be concise and accurate.',
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 1024,
        },
        {
          onChunk: () => {},
          onDone: (fullContent) => { clearTimeout(timeoutId); resolve(fullContent) },
          onError: (error) => { clearTimeout(timeoutId); reject(new Error(error)) },
        },
      )
    } catch (e) {
      clearTimeout(timeoutId)
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

function applyCompaction(
  windowId: string,
  archive: readonly Message[],
  buffer: readonly Message[],
  summary: string,
): void {
  const state = useStore.getState()
  state.compactMessages(archive, buffer)
  state.updateWindow(windowId, { isCompacted: true, compactedSummary: summary })
}

function createFallbackSummary(
  windowId: string,
): CompactionResult | null {
  const liveState = useStore.getState()
  const liveWindow = liveState.windows[windowId]
  if (liveWindow === undefined) return null

  const { archive, buffer } = splitForCompaction(
    liveState.messages,
    liveWindow.bufferSize,
  )

  if (archive.length === 0) return null

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
