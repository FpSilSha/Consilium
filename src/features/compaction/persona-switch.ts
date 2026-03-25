import type { Persona } from '@/types'
import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import { getRawKey } from '@/features/keys/key-vault'
import { createSystemMessage } from '@/services/context-bus/message-factory'
import { formatWithIdentityHeader } from '@/services/context-bus/identity-headers'

/**
 * Cheap/fast models for summarization, tried in order.
 */
const SUMMARY_MODELS = [
  { provider: 'anthropic' as const, model: 'claude-haiku-4-5-20251001' },
  { provider: 'openai' as const, model: 'gpt-4o-mini' },
  { provider: 'google' as const, model: 'gemini-2.0-flash' },
] as const

/**
 * Performs a full persona switch for an advisor window:
 *
 * 1. Announces the switch in the shared context bus
 * 2. Compacts the conversation into a summary for the new persona
 * 3. Reframes the summary so the LLM knows it is taking over the seat
 * 4. Updates the window's persona and compacted context
 */
export async function performPersonaSwitch(
  windowId: string,
  newPersona: Persona,
): Promise<void> {
  const state = useStore.getState()
  const win = state.windows[windowId]
  if (win == null) return

  const oldLabel = win.personaLabel
  const newLabel = newPersona.name

  // 1. Announce in shared context bus
  const announcement = createSystemMessage(
    `${oldLabel} has left but ${newLabel} has joined.`,
    windowId,
  )
  state.appendMessage(announcement)

  // 2. Update the window's persona immediately
  state.updateWindow(windowId, {
    personaId: newPersona.id,
    personaLabel: newLabel,
  })

  // 3. Compact and reframe for the new persona's private context
  const summary = await summarizeForPersonaSwitch(
    windowId,
    oldLabel,
    newLabel,
  )

  if (summary != null) {
    const reframed = [
      summary,
      '',
      `You are now taking over the seat of ${oldLabel}. You are ${newLabel}.`,
      'Continue the discussion from this point in your new role.',
    ].join('\n')

    state.updateWindow(windowId, {
      isCompacted: true,
      compactedSummary: reframed,
    })
  }
}

async function summarizeForPersonaSwitch(
  windowId: string,
  oldLabel: string,
  newLabel: string,
): Promise<string | null> {
  const state = useStore.getState()
  const messages = state.messages

  if (messages.length === 0) return null

  const formatted = messages
    .map(formatWithIdentityHeader)
    .join('\n\n')

  const prompt = [
    `Summarize the following conversation concisely. The advisor "${oldLabel}" is being replaced by "${newLabel}".`,
    'Preserve:',
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

  const summaryConfig = findSummaryModel(state.keys)
  if (summaryConfig == null) {
    return buildFallbackSummary(messages.length, oldLabel, newLabel)
  }

  try {
    return await runSummarization(
      summaryConfig.provider,
      summaryConfig.model,
      summaryConfig.apiKey,
      prompt,
    )
  } catch {
    return buildFallbackSummary(messages.length, oldLabel, newLabel)
  }
}

function findSummaryModel(
  keys: readonly { readonly id: string; readonly provider: string }[],
): { provider: string; model: string; apiKey: string } | null {
  for (const candidate of SUMMARY_MODELS) {
    const key = keys.find((k) => k.provider === candidate.provider)
    if (key != null) {
      const rawKey = getRawKey(key.id)
      if (rawKey != null) {
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
        onChunk: () => {},
        onDone: (fullContent) => { resolve(fullContent) },
        onError: (error) => { reject(new Error(error)) },
      },
    )
  })
}

function buildFallbackSummary(
  messageCount: number,
  oldLabel: string,
  newLabel: string,
): string {
  return [
    `[Persona switch: ${oldLabel} → ${newLabel}]`,
    `[${messageCount} messages in prior conversation]`,
    `You are taking over the seat of ${oldLabel}. You are ${newLabel}.`,
    'Continue the discussion from this point in your new role.',
  ].join('\n')
}
