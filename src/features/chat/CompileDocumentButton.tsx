import { type ReactNode, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import type { StreamCallbacks } from '@/services/api/stream-orchestrator'
import { buildSystemPrompt } from '@/services/context-bus/system-prompt'
import { messagesToApiFormat } from '@/services/context-bus/message-formatter'
import { createAssistantMessage } from '@/services/context-bus/message-factory'
import { buildCostMetadata } from '@/services/api/cost-utils'
import { getRawKey } from '@/features/keys/key-vault'

const DEFAULT_COMPILE_PROMPT = `Based on the entire conversation above, produce a single comprehensive document in markdown format.

Include:
- An executive summary
- All key decisions and conclusions reached
- Action items and next steps
- Any technical specifications or requirements discussed
- Areas of disagreement or open questions

Use proper markdown formatting: headings, lists, tables where appropriate, and code blocks for any technical content. Attribute key points to the advisor who raised them.`

/**
 * Builds the final compile prompt. The default is always sent — user focus
 * is appended as additional guidance, not a replacement, so the document
 * still has structure even when steering is provided.
 */
function buildCompilePrompt(userFocus: string): string {
  const trimmed = userFocus.trim()
  if (trimmed === '') return DEFAULT_COMPILE_PROMPT

  return `${DEFAULT_COMPILE_PROMPT}

---

ADDITIONAL GUIDANCE FROM THE USER (apply this on top of the structure above):
${trimmed}`
}

/**
 * Button that asks a selected advisor to compile the entire conversation
 * into a structured markdown document.
 */
export function CompileDocumentButton(): ReactNode {
  const windowOrder = useStore((s) => s.windowOrder)
  const windows = useStore((s) => s.windows)
  const messages = useStore((s) => s.messages)
  const keys = useStore((s) => s.keys)
  const personas = useStore((s) => s.personas)

  const [compiling, setCompiling] = useState(false)
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [userFocus, setUserFocus] = useState('')

  const handleCompile = useCallback((windowId: string) => {
    const win = windows[windowId]
    if (win == null) return

    const key = keys.find((k) => k.id === win.keyId)
    if (key == null) return

    const apiKey = getRawKey(key.id)
    if (apiKey == null) return

    const persona = personas.find((p) => p.id === win.personaId)
    const systemPrompt = buildSystemPrompt(persona?.content ?? '', undefined)
    const threadMessages = messagesToApiFormat(messages, {
      windowId,
      personaLabel: win.personaLabel,
    })

    setCompiling(true)
    setShowPicker(false)
    setSelectedWindowId(windowId)

    const state = useStore.getState()
    state.updateWindow(windowId, { isStreaming: true, streamContent: '' })

    const callbacks: StreamCallbacks = {
      onChunk: (content) => {
        const current = useStore.getState()
        const currentWindow = current.windows[windowId]
        if (currentWindow == null) return
        current.updateWindow(windowId, {
          streamContent: currentWindow.streamContent + content,
        })
      },
      onDone: (fullContent, tokenUsage) => {
        const current = useStore.getState()
        const freshWindow = current.windows[windowId]
        const costMeta = buildCostMetadata(tokenUsage, freshWindow?.model ?? win.model)

        const message = createAssistantMessage(
          fullContent,
          `${freshWindow?.personaLabel ?? win.personaLabel} (Document)`,
          windowId,
          costMeta ?? undefined,
        )

        current.appendMessage(message)
        current.updateWindow(windowId, {
          isStreaming: false,
          streamContent: '',
          runningCost: (freshWindow?.runningCost ?? 0) + (costMeta?.estimatedCost ?? 0),
        })
        setCompiling(false)
      },
      onError: (error) => {
        const current = useStore.getState()
        current.updateWindow(windowId, {
          isStreaming: false,
          streamContent: '',
          error,
        })
        setCompiling(false)
      },
    }

    const compilePrompt = buildCompilePrompt(userFocus)

    streamResponse(
      {
        provider: win.provider,
        model: win.model,
        apiKey,
        systemPrompt,
        messages: [...threadMessages, { role: 'user' as const, content: compilePrompt }],
      },
      callbacks,
    )
  }, [windows, keys, personas, messages, userFocus])

  if (messages.length < 3) return null // Not enough conversation to compile

  return (
    <div className="relative">
      <button
        onClick={() => setShowPicker((v) => !v)}
        disabled={compiling}
        className="rounded-md bg-surface-hover px-2.5 py-1 text-xs text-content-muted transition-colors hover:bg-surface-active hover:text-content-primary disabled:opacity-50"
      >
        {compiling ? 'Compiling...' : 'Compile Document'}
      </button>

      {showPicker && (
        <div className="absolute bottom-full left-0 z-40 mb-1 w-80 rounded-md border border-edge-subtle bg-surface-panel p-3 shadow-lg">
          {/* What this does */}
          <p className="mb-1 text-[11px] font-medium text-content-primary">
            Compile Document
          </p>
          <p className="mb-2 text-[10px] text-content-disabled">
            The selected advisor reads the full conversation and writes a single comprehensive markdown document — executive summary, key decisions, action items, technical specs, and open questions, with attribution to whoever raised each point.
          </p>

          {/* Optional focus textarea */}
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-disabled">
            Focus / Ignore (optional)
          </label>
          <textarea
            value={userFocus}
            onChange={(e) => setUserFocus(e.target.value)}
            placeholder="e.g., Focus on the security architecture decisions. Ignore the budget tangent."
            rows={3}
            className="mb-2 w-full resize-none rounded-md border border-edge-subtle bg-surface-base px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
          />
          <p className="mb-2 text-[10px] text-content-disabled">
            This guidance is appended to the default instructions — the document still has the standard structure.
          </p>

          {/* Cost warning */}
          <p className="mb-2 rounded bg-yellow-900/20 px-2 py-1 text-[10px] text-yellow-400">
            Sends the full chat to the selected model and will incur API costs. Cheaper models may produce lower-quality results.
          </p>

          {/* Advisor picker */}
          <p className="mb-1 text-[10px] font-medium text-content-disabled">
            Compile with:
          </p>
          {windowOrder.map((id) => {
            const win = windows[id]
            if (win == null) return null
            return (
              <button
                key={id}
                onClick={() => handleCompile(id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-content-primary transition-colors hover:bg-surface-hover"
              >
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: win.accentColor }} />
                <span className="truncate">{win.personaLabel}</span>
                <span className="ml-auto truncate text-[10px] text-content-disabled">{win.model.split('/').pop()}</span>
              </button>
            )
          })}

          <div className="mt-2 flex justify-end border-t border-edge-subtle pt-2">
            <button
              onClick={() => { setShowPicker(false); setUserFocus('') }}
              className="rounded-md px-2 py-1 text-[10px] text-content-disabled hover:text-content-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
