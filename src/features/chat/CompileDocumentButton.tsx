import { type ReactNode, useState, useCallback, useMemo, useEffect } from 'react'
import type { Provider, ModelInfo } from '@/types'
import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import type { StreamCallbacks } from '@/services/api/stream-orchestrator'
import { messagesToApiFormat } from '@/services/context-bus/message-formatter'
import { buildCostMetadata } from '@/services/api/cost-utils'
import { getRawKey } from '@/features/keys/key-vault'
import { estimateThreadTokens } from '@/features/compaction/compaction-engine'
import { estimateTokens } from '@/services/tokenizer/char-estimator'
import { computeConservativeCompileEstimate } from './compile-estimate'
import { resolveModelById } from '@/features/modelSelector/model-resolve'
import { useFilteredModels } from '@/features/modelCatalog/use-filtered-models'
import { SearchableModelSelect } from '@/features/modelCatalog/SearchableModelSelect'
import { formatProviderLabel } from '@/features/modelCatalog/format-provider-label'
import type { SessionDocument } from '@/features/documents/types'
import { registerActiveCompile, clearActiveCompile } from '@/features/documents/compile-controller'
import { COMPILE_PRESETS, getPresetById } from './compile-presets'
import { COMPILE_SYSTEM_PROMPT } from './compile-system-prompt'

/**
 * Builds the final compile prompt sent as the last user message in the
 * compile API call.
 *
 * Three modes:
 *   1. Preset only (no focus prompt) — return the preset's prompt verbatim.
 *   2. Preset + appended focus — preset prompt, then a separator, then the
 *      user's focus text labeled as additional guidance.
 *   3. Replace mode (focus REPLACES preset) — when `replaceDefault` is true
 *      AND the user typed a focus prompt, the focus text fully replaces
 *      the preset's instructions. The system prompt still applies, so the
 *      model still knows about the conversation format and honesty rules.
 *
 * When focus is empty, `replaceDefault` is ignored — there's nothing to
 * replace with, so the preset is used as-is.
 */
function buildCompilePrompt(
  presetId: string,
  userFocus: string,
  replaceDefault: boolean,
): string {
  const trimmedFocus = userFocus.trim()
  const preset = getPresetById(presetId)

  if (trimmedFocus === '') return preset.prompt

  if (replaceDefault) {
    // User's focus text fully replaces the preset's instructions.
    // No separator, no "additional guidance" framing — the focus IS the
    // instructions. The system prompt still provides context format +
    // honesty rules, so the model isn't flying blind.
    return trimmedFocus
  }

  // Default: append focus as additional guidance on top of the preset.
  return `${preset.prompt}

---

ADDITIONAL GUIDANCE FROM THE USER (apply this on top of the structure above):
${trimmedFocus}`
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
  const globalCompilePresetId = useStore((s) => s.compilePresetId)
  const addDocument = useStore((s) => s.addDocument)
  const setDraftCompile = useStore((s) => s.setDraftCompile)
  const appendDraftCompileContent = useStore((s) => s.appendDraftCompileContent)
  const setDocumentsPanelOpen = useStore((s) => s.setDocumentsPanelOpen)
  const accumulateCompileCost = useStore((s) => s.accumulateCompileCost)

  const [showPicker, setShowPicker] = useState(false)
  const [browseMode, setBrowseMode] = useState(false)
  const [userFocus, setUserFocus] = useState('')
  // Per-call preset override — seeds from the global default each time the
  // picker opens but the user can change it for this compile only.
  const [selectedPresetId, setSelectedPresetId] = useState(globalCompilePresetId)
  // When true AND userFocus is non-empty, the focus text fully replaces the
  // preset's instructions instead of being appended.
  const [replaceDefault, setReplaceDefault] = useState(false)
  const [compiling, setCompiling] = useState(false)

  // Re-seed the preset selection from the global default whenever it changes
  // (e.g., user updates the global default in Compile Settings while the
  // popover is closed). Doesn't override an in-progress per-call selection.
  // Only applies when the picker is closed — once open, the user owns the
  // dropdown for that session of the popover.
  useEffect(() => {
    if (!showPicker) {
      setSelectedPresetId(globalCompilePresetId)
    }
  }, [globalCompilePresetId, showPicker])

  const selectedPreset = getPresetById(selectedPresetId)

  // Conservative estimate of compile input tokens — lean HIGH on purpose.
  // See computeConservativeCompileEstimate() above for the formula.
  //
  // Split into two memos so typing in the focus textarea doesn't re-iterate
  // the entire message thread on every keystroke. Thread token counting is
  // O(n) over all messages and only needs to recompute when `messages` changes.
  const threadTokens = useMemo(
    () => estimateThreadTokens(messages),
    [messages],
  )
  const estimatedInputTokens = useMemo(() => {
    const focusTokens = userFocus.trim() !== '' ? estimateTokens(userFocus) : 0
    return computeConservativeCompileEstimate(threadTokens, focusTokens)
  }, [threadTokens, userFocus])

  /**
   * Fires the actual compile call. Fully isolated — does NOT touch any
   * advisor's stream slot. The result lands as a draft in the documents
   * sidebar while streaming, then becomes a saved SessionDocument on
   * completion.
   *
   * Session-switch safety: captures the current sessionId at compile-start
   * and verifies it still matches before committing. If the user switches
   * sessions mid-compile, the compile controller is aborted by loadSession
   * via abortActiveCompile(); even if a callback still lands somehow, the
   * sessionId guard discards the result so it can't land in the wrong
   * session.
   */
  const handleCompile = useCallback((provider: string, model: string, keyId: string) => {
    const apiKey = getRawKey(keyId)
    if (apiKey == null) return

    const modelInfo = resolveModelById(model)
    const modelName = modelInfo?.name ?? model

    // Capture session identity at compile-start — used to discard results
    // that arrive after a session switch.
    const startSessionId = useStore.getState().currentSessionId

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
    // Capture the preset/focus state at compile-start so the doc records
    // exactly what the user chose, even if they re-open the picker and
    // change settings while the compile is in flight.
    const presetIdAtStart = selectedPresetId
    const focusAtStart = userFocus
    const replaceAtStart = replaceDefault && userFocus.trim() !== ''
    const compilePrompt = buildCompilePrompt(presetIdAtStart, focusAtStart, replaceAtStart)

    // Holder for the controller so callbacks can check it. Assigned after
    // streamResponse returns it.
    let controller: AbortController | null = null

    const isStillCurrentSession = (): boolean =>
      useStore.getState().currentSessionId === startSessionId

    const callbacks: StreamCallbacks = {
      onChunk: (chunk) => {
        if (controller?.signal.aborted) return
        if (!isStillCurrentSession()) return
        appendDraftCompileContent(chunk)
      },

      onDone: async (fullContent, tokenUsage) => {
        if (controller != null) clearActiveCompile(controller)

        // Discard if this compile was superseded or the session changed.
        if (controller?.signal.aborted) {
          setCompiling(false)
          return
        }
        if (!isStillCurrentSession()) {
          // Don't touch state belonging to the new session
          setCompiling(false)
          return
        }

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
          ...(focusAtStart.trim() !== '' ? { focusPrompt: focusAtStart.trim() } : {}),
          presetId: presetIdAtStart,
          ...(replaceAtStart ? { focusReplacedDefault: true } : {}),
        }

        // Try disk first. If save fails, surface as an error draft and
        // do NOT add the doc to the session — keeping the on-disk and
        // in-memory state in sync.
        const api = (window as { consiliumAPI?: { documentsSave(doc: Record<string, unknown>): Promise<void> } }).consiliumAPI
        if (api != null) {
          try {
            await api.documentsSave(doc as unknown as Record<string, unknown>)
          } catch (e) {
            setDraftCompile({
              title: 'Compile saved-to-disk failed',
              content: '',
              modelName,
              status: 'error',
              error: e instanceof Error ? e.message : 'Failed to save document',
            })
            setCompiling(false)
            setTimeout(() => {
              const current = useStore.getState().draftCompile
              if (current?.status === 'error') setDraftCompile(null)
            }, 5000)
            return
          }
        }

        // Re-check session ID one more time after the await — the user
        // could have switched sessions while documentsSave was in flight.
        if (!isStillCurrentSession()) {
          setCompiling(false)
          return
        }

        addDocument(doc)
        accumulateCompileCost(cost)
        setDraftCompile(null)
        setCompiling(false)
        setUserFocus('')
        setReplaceDefault(false)
      },

      onError: (error) => {
        if (controller != null) clearActiveCompile(controller)
        if (!isStillCurrentSession()) {
          setCompiling(false)
          return
        }
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

    controller = streamResponse(
      {
        provider: provider as Provider,
        model,
        apiKey,
        // Compile model gets its own purpose-built system prompt that
        // explains the [Label]: identity-header convention from the
        // shared context bus + honesty rules. Replaces the previous
        // anemic "You are a document compiler. Produce well-structured
        // markdown." one-liner.
        systemPrompt: COMPILE_SYSTEM_PROMPT,
        messages: [...threadMessages, { role: 'user' as const, content: compilePrompt }],
        maxTokens: compileMaxTokens,
      },
      callbacks,
    )
    registerActiveCompile(controller)
  }, [
    messages,
    userFocus,
    selectedPresetId,
    replaceDefault,
    compileMaxTokens,
    addDocument,
    accumulateCompileCost,
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
            The compile model reads the full conversation and produces a markdown document in the selected style. The result lands in the Documents panel on the right — it does not get added to the chat.
          </p>

          {/* Style preset dropdown */}
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-disabled">
            Style
          </label>
          <select
            value={selectedPresetId}
            onChange={(e) => setSelectedPresetId(e.target.value)}
            className="mb-1 w-full rounded-md border border-edge-subtle bg-surface-base px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
          >
            {COMPILE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
          <p className="mb-2 text-[10px] italic text-content-disabled">
            {selectedPreset.description}
          </p>

          {/* Optional focus textarea */}
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-disabled">
            Focus / Ignore (optional)
          </label>
          <textarea
            value={userFocus}
            onChange={(e) => {
              const next = e.target.value
              setUserFocus(next)
              // Auto-uncheck "Replace default" when the focus textarea is
              // emptied. Without this, the checkbox stays visually checked
              // but disabled — confusing UX implying an active setting that
              // has no effect (the compile path correctly ignores it via
              // the replaceAtStart capture, but the visual state lies).
              if (next.trim() === '' && replaceDefault) {
                setReplaceDefault(false)
              }
            }}
            placeholder="e.g., Focus on the security architecture decisions. Ignore the budget tangent."
            rows={3}
            className="mb-1 w-full resize-none rounded-md border border-edge-subtle bg-surface-base px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
          />

          {/* Replace-default toggle — only meaningful when focus is non-empty */}
          <label className={`mb-2 flex items-center gap-1.5 text-[10px] ${userFocus.trim() === '' ? 'text-content-disabled' : 'text-content-muted cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={replaceDefault}
              onChange={(e) => setReplaceDefault(e.target.checked)}
              disabled={userFocus.trim() === ''}
              className="h-3 w-3 accent-accent-blue disabled:opacity-50"
            />
            <span>
              Replace style with my focus text
              {userFocus.trim() === '' && <span className="text-content-disabled"> (type a focus prompt first)</span>}
            </span>
          </label>
          <p className="mb-2 text-[10px] italic text-content-disabled">
            {userFocus.trim() === '' || !replaceDefault
              ? 'Focus text is appended to the style. The document still follows the selected style.'
              : 'Focus text fully replaces the style instructions. Use this for one-off custom compiles.'}
          </p>

          {/* Cost warning */}
          <p className="mb-2 rounded bg-yellow-900/20 px-2 py-1 text-[10px] text-yellow-400">
            Sends the full chat to the selected model. Compile is an isolated API call — it does not run as one of the advisors. Cost is added to the session ledger.
          </p>

          {/* Default model quick-fire — also gated by context-window check
              using the same conservative estimate as the browser. */}
          {globalCompileConfig != null && !browseMode && (() => {
            const defaultModel = resolveModelById(globalCompileConfig.model)
            const defaultContextWindow = defaultModel?.contextWindow ?? 0
            const defaultUsagePercent = defaultContextWindow > 0
              ? Math.round((estimatedInputTokens / defaultContextWindow) * 100)
              : 0
            const defaultExceedsContext =
              defaultContextWindow > 0 && estimatedInputTokens > defaultContextWindow

            return (
              <div className="mb-2 rounded-md border border-accent-blue/30 bg-accent-blue/10 p-2">
                <p className="mb-1 text-[10px] text-content-disabled">Global default</p>
                <button
                  onClick={handleCompileWithDefault}
                  disabled={defaultExceedsContext}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-content-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="h-2 w-2 rounded-full bg-accent-blue" />
                  <span className="truncate">
                    {defaultModel?.name ?? globalCompileConfig.model}
                  </span>
                  <span className="ml-auto text-[10px] text-accent-blue">
                    {defaultExceedsContext ? 'Too large' : 'Use default →'}
                  </span>
                </button>
                {defaultContextWindow > 0 && (
                  <p className={`mt-1 text-[10px] ${
                    defaultExceedsContext
                      ? 'text-error'
                      : defaultUsagePercent > 80
                        ? 'text-yellow-400'
                        : 'text-content-disabled'
                  }`}>
                    {defaultExceedsContext
                      ? `Chat exceeds ${defaultContextWindow.toLocaleString()}-token context window. Pick a larger model below.`
                      : defaultUsagePercent > 80
                        ? `${defaultUsagePercent}% of context window — compile may truncate.`
                        : `${defaultUsagePercent}% of context window`}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-content-disabled">
                  Set in Edit → Compile Settings.
                </p>
              </div>
            )
          })()}

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
                setReplaceDefault(false)
                // Don't reset selectedPresetId — the useEffect re-seeds
                // it from the global default the next time the picker
                // opens (showPicker === false), so it stays in sync
                // with any changes made in Compile Settings.
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
        Estimated input <span className="text-content-disabled">(conservative)</span>:{' '}
        <span className="text-content-muted">{estimatedInputTokens.toLocaleString()} tokens</span>
      </p>
      <p className="mb-2 text-[9px] italic text-content-disabled">
        Padded ~50% above the raw character count to cover code-heavy and Unicode content, plus compile-prompt overhead. Actual usage will be lower for prose-only chats.
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

