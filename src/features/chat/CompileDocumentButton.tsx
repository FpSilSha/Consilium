import { type ReactNode, useState, useCallback, useMemo } from 'react'
import type { Provider, ModelInfo } from '@/types'
import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import type { StreamCallbacks } from '@/services/api/stream-orchestrator'
import { messagesToApiFormat } from '@/services/context-bus/message-formatter'
import { buildCostMetadata } from '@/services/api/cost-utils'
import { getRawKey } from '@/features/keys/key-vault'
import { estimateThreadTokens } from '@/features/compaction/compaction-engine'
import { resolveModelById } from '@/features/modelSelector/model-resolve'
import { useFilteredModels } from '@/features/modelCatalog/use-filtered-models'
import { SearchableModelSelect } from '@/features/modelCatalog/SearchableModelSelect'
import type { SessionDocument } from '@/features/documents/types'

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
 * Extracts a human-readable title from generated markdown.
 * Falls back to "Document — <date>" when no heading is present.
 */
function deriveDocumentTitle(content: string): string {
  // Look for the first ATX heading (# Foo, ## Foo, etc.)
  const match = content.match(/^#{1,6}\s+(.+?)\s*$/m)
  if (match != null && match[1] != null) {
    return match[1].slice(0, 80).trim()
  }
  return `Document — ${new Date().toLocaleString()}`
}

interface PickerCandidate {
  readonly provider: Provider
  readonly keyId: string
  readonly model: ModelInfo
  /** True if the chat exceeds the model's context window. */
  readonly exceedsContext: boolean
  /** Percentage of the model's context window the chat would consume (0-100+). */
  readonly contextUsagePercent: number
}

export function CompileDocumentButton(): ReactNode {
  const messages = useStore((s) => s.messages)
  const keys = useStore((s) => s.keys)
  const compileMaxTokens = useStore((s) => s.compileMaxTokens)
  const globalCompileConfig = useStore((s) => s.compileModelConfig)
  const addDocument = useStore((s) => s.addDocument)
  const setDraftCompile = useStore((s) => s.setDraftCompile)
  const appendDraftCompileContent = useStore((s) => s.appendDraftCompileContent)
  const setDocumentsPanelOpen = useStore((s) => s.setDocumentsPanelOpen)

  const [showPicker, setShowPicker] = useState(false)
  const [browseMode, setBrowseMode] = useState(false)
  const [userFocus, setUserFocus] = useState('')
  const [compiling, setCompiling] = useState(false)

  // Estimated input tokens for the chat — used to flag context overruns.
  const estimatedInputTokens = useMemo(
    () => estimateThreadTokens(messages),
    [messages],
  )

  /**
   * Fires the actual compile call. Fully isolated — does NOT touch any
   * advisor's stream slot. The result lands as a draft in the documents
   * sidebar while streaming, then becomes a saved SessionDocument on
   * completion.
   */
  const handleCompile = useCallback((provider: string, model: string, keyId: string) => {
    const apiKey = getRawKey(keyId)
    if (apiKey == null) return

    const modelInfo = resolveModelById(model)
    const modelName = modelInfo?.name ?? model

    setShowPicker(false)
    setBrowseMode(false)
    setCompiling(true)
    setDocumentsPanelOpen(true)
    setDraftCompile({
      title: 'Compiling…',
      content: '',
      modelName,
      status: 'streaming',
    })

    // Self-context here doesn't matter — the compile model isn't an advisor
    // in this thread, so it has no own past turns to imitate. Pass undefined.
    const threadMessages = messagesToApiFormat(messages)
    const compilePrompt = buildCompilePrompt(userFocus)

    const callbacks: StreamCallbacks = {
      onChunk: (chunk) => {
        appendDraftCompileContent(chunk)
      },

      onDone: async (fullContent, tokenUsage) => {
        const costMeta = buildCostMetadata(tokenUsage, model)
        const cost = costMeta?.estimatedCost ?? 0

        const doc: SessionDocument = {
          id: crypto.randomUUID(),
          title: deriveDocumentTitle(fullContent),
          content: fullContent,
          provider,
          model,
          modelName,
          cost,
          createdAt: Date.now(),
          ...(userFocus.trim() !== '' ? { focusPrompt: userFocus.trim() } : {}),
        }

        // Persist to disk first — if the IPC save fails we still want the
        // document visible in the session for the current run. The IPC
        // bridge types this as Record<string, unknown>; the readonly
        // SessionDocument shape is structurally compatible at runtime.
        const api = (window as { consiliumAPI?: { documentsSave(doc: Record<string, unknown>): Promise<void> } }).consiliumAPI
        if (api != null) {
          try {
            await api.documentsSave(doc as unknown as Record<string, unknown>)
          } catch {
            // Non-fatal — doc still appears in session for this run
          }
        }

        addDocument(doc)
        setDraftCompile(null)
        setCompiling(false)
        setUserFocus('')
      },

      onError: (error) => {
        setDraftCompile({
          title: 'Compile failed',
          content: '',
          modelName,
          status: 'error',
          error,
        })
        setCompiling(false)
        // Auto-clear the error draft after a few seconds
        setTimeout(() => {
          const current = useStore.getState().draftCompile
          if (current?.status === 'error') setDraftCompile(null)
        }, 5000)
      },
    }

    streamResponse(
      {
        provider: provider as Provider,
        model,
        apiKey,
        systemPrompt: 'You are a document compiler. Produce well-structured markdown.',
        messages: [...threadMessages, { role: 'user' as const, content: compilePrompt }],
        maxTokens: compileMaxTokens,
      },
      callbacks,
    )
  }, [
    messages,
    userFocus,
    compileMaxTokens,
    addDocument,
    setDraftCompile,
    appendDraftCompileContent,
    setDocumentsPanelOpen,
  ])

  // Quick-fire with the global default model if one is configured.
  const handleCompileWithDefault = useCallback(() => {
    if (globalCompileConfig == null) return
    handleCompile(
      globalCompileConfig.provider,
      globalCompileConfig.model,
      globalCompileConfig.keyId,
    )
  }, [globalCompileConfig, handleCompile])

  if (messages.length < 3) return null

  return (
    <div className="relative">
      <button
        onClick={() => setShowPicker((v) => !v)}
        disabled={compiling}
        className="rounded-md bg-surface-hover px-2.5 py-1 text-xs text-content-muted transition-colors hover:bg-surface-active hover:text-content-primary disabled:opacity-50"
      >
        {compiling ? 'Compiling…' : 'Compile Document'}
      </button>

      {showPicker && (
        <div className="absolute bottom-full left-0 z-40 mb-1 w-96 rounded-md border border-edge-subtle bg-surface-panel p-3 shadow-lg">
          <p className="mb-1 text-[11px] font-medium text-content-primary">
            Compile Document
          </p>
          <p className="mb-2 text-[10px] text-content-disabled">
            The compile model reads the full conversation and writes a single comprehensive markdown document — executive summary, decisions, action items, technical specs, and open questions, with attribution to whoever raised each point. The result lands in the Documents panel on the right.
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
            Appended to the default instructions — the document still has the standard structure.
          </p>

          {/* Cost warning */}
          <p className="mb-2 rounded bg-yellow-900/20 px-2 py-1 text-[10px] text-yellow-400">
            Sends the full chat to the selected model. Compile is an isolated API call — it does not run as one of the advisors. Cost is added to the session ledger.
          </p>

          {/* Default model quick-fire */}
          {globalCompileConfig != null && !browseMode && (
            <div className="mb-2 rounded-md border border-accent-blue/30 bg-accent-blue/10 p-2">
              <p className="mb-1 text-[10px] text-content-disabled">Global default</p>
              <button
                onClick={handleCompileWithDefault}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-content-primary transition-colors hover:bg-surface-hover"
              >
                <div className="h-2 w-2 rounded-full bg-accent-blue" />
                <span className="truncate">
                  {resolveModelById(globalCompileConfig.model)?.name ?? globalCompileConfig.model}
                </span>
                <span className="ml-auto text-[10px] text-accent-blue">Use default →</span>
              </button>
              <p className="mt-1 text-[10px] text-content-disabled">
                Set in Edit → Compile Settings.
              </p>
            </div>
          )}

          {!browseMode ? (
            <button
              onClick={() => setBrowseMode(true)}
              disabled={keys.length === 0}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-edge-subtle px-2 py-2 text-xs text-content-muted transition-colors hover:border-edge-focus hover:text-content-primary disabled:opacity-50"
            >
              {keys.length === 0 ? 'No API keys configured' : 'Pick a different model…'}
            </button>
          ) : (
            <BrowseModels
              estimatedInputTokens={estimatedInputTokens}
              onSelect={handleCompile}
              onBack={() => setBrowseMode(false)}
            />
          )}

          <div className="mt-2 flex justify-end border-t border-edge-subtle pt-2">
            <button
              onClick={() => {
                setShowPicker(false)
                setBrowseMode(false)
                setUserFocus('')
              }}
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

// ─────────────────────────────────────────────────────────────────────────
// Model browser with token-estimate warnings per row
// ─────────────────────────────────────────────────────────────────────────

interface BrowseModelsProps {
  readonly estimatedInputTokens: number
  readonly onSelect: (provider: string, model: string, keyId: string) => void
  readonly onBack: () => void
}

function BrowseModels({ estimatedInputTokens, onSelect, onBack }: BrowseModelsProps): ReactNode {
  const keys = useStore((s) => s.keys)

  const providersWithKeys = useMemo(() => {
    const map = new Map<Provider, { keyId: string; label: string }>()
    for (const key of keys) {
      const provider = key.provider as Provider
      if (!map.has(provider)) {
        map.set(provider, { keyId: key.id, label: formatProviderLabel(provider) })
      }
    }
    return Array.from(map.entries()).map(([provider, info]) => ({ provider, ...info }))
  }, [keys])

  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    providersWithKeys[0]?.provider ?? null,
  )

  return (
    <div className="rounded-md border border-edge-subtle p-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-medium text-content-disabled">Browse models</p>
        <button
          onClick={onBack}
          className="text-[10px] text-content-muted hover:text-content-primary"
        >
          ← Back
        </button>
      </div>

      <p className="mb-2 text-[10px] text-content-disabled">
        Estimated input: <span className="text-content-muted">{estimatedInputTokens.toLocaleString()} tokens</span>
      </p>

      <label className="mb-1 block text-[10px] text-content-disabled">Provider</label>
      <select
        value={selectedProvider ?? ''}
        onChange={(e) => setSelectedProvider(e.target.value as Provider)}
        className="mb-2 w-full rounded-md border border-edge-subtle bg-surface-base px-2 py-1 text-xs text-content-primary outline-none focus:border-edge-focus"
      >
        {providersWithKeys.map((p) => (
          <option key={p.provider} value={p.provider}>{p.label}</option>
        ))}
      </select>

      {selectedProvider != null && (
        <BrowseModelsList
          provider={selectedProvider}
          keyId={providersWithKeys.find((p) => p.provider === selectedProvider)?.keyId ?? ''}
          estimatedInputTokens={estimatedInputTokens}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}

function BrowseModelsList({ provider, keyId, estimatedInputTokens, onSelect }: {
  readonly provider: Provider
  readonly keyId: string
  readonly estimatedInputTokens: number
  readonly onSelect: (provider: string, model: string, keyId: string) => void
}): ReactNode {
  const models = useFilteredModels(provider)
  const [selectedModelId, setSelectedModelId] = useState('')

  // Surface a context-window warning for the currently selected model
  const selectedModel = models.find((m) => m.id === selectedModelId)
  const usagePercent = selectedModel != null && selectedModel.contextWindow > 0
    ? Math.round((estimatedInputTokens / selectedModel.contextWindow) * 100)
    : 0
  const exceedsContext = selectedModel != null && selectedModel.contextWindow > 0 && estimatedInputTokens > selectedModel.contextWindow

  if (models.length === 0) {
    return (
      <p className="text-[10px] text-content-disabled">
        No models available for this provider. Configure allowed models in Models &amp; Keys.
      </p>
    )
  }

  return (
    <>
      <label className="mb-1 block text-[10px] text-content-disabled">Model</label>
      <SearchableModelSelect
        models={models}
        value={selectedModelId}
        onChange={setSelectedModelId}
      />

      {selectedModel != null && (
        <div className="mt-2 rounded-md bg-surface-base px-2 py-1.5 text-[10px]">
          <div className="flex items-center justify-between text-content-disabled">
            <span>Context window</span>
            <span className={exceedsContext ? 'text-error' : usagePercent > 80 ? 'text-yellow-400' : 'text-content-muted'}>
              {usagePercent}% used ({selectedModel.contextWindow.toLocaleString()} tokens)
            </span>
          </div>
          {exceedsContext && (
            <p className="mt-1 text-error">
              Chat exceeds this model's context window — compile will fail. Pick a larger model.
            </p>
          )}
          {!exceedsContext && usagePercent > 80 && (
            <p className="mt-1 text-yellow-400">
              Chat is close to this model's limit. Compile may truncate.
            </p>
          )}
        </div>
      )}

      <button
        onClick={() => {
          if (selectedModelId === '' || exceedsContext) return
          onSelect(provider, selectedModelId, keyId)
        }}
        disabled={selectedModelId === '' || exceedsContext}
        className="mt-2 w-full rounded-md bg-accent-blue px-2 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90 disabled:opacity-50"
      >
        Compile with this model
      </button>
    </>
  )
}

function formatProviderLabel(provider: Provider): string {
  switch (provider) {
    case 'anthropic': return 'Anthropic'
    case 'openai': return 'OpenAI'
    case 'google': return 'Google'
    case 'xai': return 'xAI'
    case 'deepseek': return 'DeepSeek'
    case 'openrouter': return 'OpenRouter'
    case 'custom': return 'Custom'
    default: return provider
  }
}
