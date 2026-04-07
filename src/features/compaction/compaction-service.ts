import type { Message } from '@/types'
import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import { createAssistantMessage } from '@/services/context-bus/message-factory'
import { getRawKey } from '@/features/keys/key-vault'
import {
  splitForCompaction,
  buildSummaryPrompt,
  shouldCompact,
} from './compaction-engine'
import { resolveCompactPromptTemplateWithFallback } from '@/features/compactPrompts/compact-prompts-resolver'

interface CompactionResult {
  readonly archiveSummary: string
  readonly archivedCount: number
  readonly bufferCount: number
}

/**
 * Runs compaction for a specific window.
 * Summarizes older messages, archives them, and marks the window as compacted.
 * Guards against concurrent compaction for the same window.
 *
 * Requires the user to have configured an auto-compaction model (via the
 * AutoCompactButton). If no model is configured or the selected key is no
 * longer available, this returns null and compaction is skipped — we do NOT
 * fall back to a static placeholder summary. Better UX is to leave the thread
 * alone than to silently replace history with a useless "archived N messages"
 * stub that the advisors can't actually reason about.
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

  // Require a user-selected model. Guarded at the checkAutoCompaction level
  // too, but this is the safety net in case compactWindow is ever called
  // directly without going through the sweep.
  if (state.autoCompactionConfig === null) return null

  const summaryConfig = resolveAutoCompactionConfig(state.autoCompactionConfig)
  if (summaryConfig === null) return null

  const { archive } = splitForCompaction(state.messages, window.bufferSize)
  if (archive.length === 0) return null

  // Resolve the user's configured compact prompt template from the
  // store. Falls back to the built-in base entry if the selected
  // custom was deleted — same self-healing pattern as the other
  // library consumers.
  const autoTemplate = resolveCompactPromptTemplateWithFallback(
    state.compactPromptId,
    state.customCompactPrompts,
  )
  const summaryPrompt = buildSummaryPrompt(archive, autoTemplate)

  let summary: string
  try {
    summary = await runSummarization(
      summaryConfig.provider,
      summaryConfig.model,
      summaryConfig.apiKey,
      summaryPrompt,
    )
  } catch {
    // Summarization failed — skip compaction entirely. No static fallback.
    return null
  }

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
 *
 * Off by default — only runs when the user has explicitly enabled
 * auto-compaction and selected a summarization model.
 */
export function checkAutoCompaction(): void {
  const state = useStore.getState()

  if (!state.autoCompactionEnabled) return
  if (state.autoCompactionConfig === null) return

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

  // Manual compact uses the same configured template as auto compact.
  // Single source of truth — a custom template the user created
  // applies to both paths without a per-path toggle.
  const manualTemplate = resolveCompactPromptTemplateWithFallback(
    state.compactPromptId,
    state.customCompactPrompts,
  )
  const prompt = buildSummaryPrompt(archive, manualTemplate)
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

/**
 * Resolves a user-selected auto-compaction config to the {provider, model,
 * apiKey} shape executeWindowCompaction expects. Returns null if the key has
 * been deleted or is unavailable since the user picked it.
 */
function resolveAutoCompactionConfig(
  config: { readonly provider: string; readonly model: string; readonly keyId: string },
): { provider: string; model: string; apiKey: string } | null {
  const apiKey = getRawKey(config.keyId)
  if (apiKey === null) return null
  return { provider: config.provider, model: config.model, apiKey }
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
