import { type ReactNode, useCallback, useState, useMemo, useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { getModelById } from '@/features/modelSelector/model-registry'
import { useRegisterDirtyGuard } from '@/features/configuration/dirty-guard'
import { withTimeout } from '@/features/configuration/with-timeout'
import { BrowseModels } from './BrowseModels'
import {
  getMergedCompilePrompts,
  resolveCompilePromptWithFallback,
} from '@/features/compilePrompts/compile-prompts-resolver'

/**
 * Compile Settings pane — global Compile Document settings, ported
 * from the standalone CompileSettingsModal into the unified
 * ConfigurationModal as a native pane.
 *
 * Manages three persisted fields:
 *   - compileModelConfig — default model for Compile Document
 *   - compileMaxTokens   — output token cap
 *   - compilePresetId    — default style preset (base or custom)
 *
 * Save flow is disk-first, store-second — mirrors the per-pane
 * save semantics used by every other native pane. Dirty state is
 * registered with the ConfigurationModal via useRegisterDirtyGuard
 * so the user is warned if they try to switch panes with unsaved
 * draft changes.
 *
 * Structurally identical to the pre-port CompileSettingsModal body
 * minus the outer fixed-position chrome (the ConfigurationModal
 * provides the dialog wrapper, header, and close affordance).
 */
export function CompileSettingsPane(): ReactNode {
  const compileModelConfig = useStore((s) => s.compileModelConfig)
  const compileMaxTokens = useStore((s) => s.compileMaxTokens)
  const compilePresetId = useStore((s) => s.compilePresetId)
  const customCompilePrompts = useStore((s) => s.customCompilePrompts)
  const setCompileModelConfig = useStore((s) => s.setCompileModelConfig)
  const setCompileMaxTokens = useStore((s) => s.setCompileMaxTokens)
  const setCompilePresetId = useStore((s) => s.setCompilePresetId)
  const keys = useStore((s) => s.keys)
  const orModels = useStore((s) => s.catalogModels['openrouter']) ?? []

  // Local draft — committed only on Save
  const [draftConfig, setDraftConfig] = useState(compileModelConfig)
  const [draftMaxTokens, setDraftMaxTokens] = useState(String(compileMaxTokens))
  const [draftPresetId, setDraftPresetId] = useState(compilePresetId)
  const [browseMode, setBrowseMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed effect lives below the isDirty calc so it can consult
  // isDirtyRef before clobbering. See the gated re-seed useEffect
  // further down in this function.

  const draftPreset = resolveCompilePromptWithFallback(draftPresetId, customCompilePrompts)
  const mergedCompilePrompts = useMemo(
    () => getMergedCompilePrompts(customCompilePrompts),
    [customCompilePrompts],
  )

  // Self-heal: if the persisted `compilePresetId` references a custom
  // that no longer exists, resolveCompilePromptWithFallback falls back
  // to 'comprehensive' — but draftPresetId still holds the stale id.
  // Align the draft with the resolved id so Save persists the healed
  // value.
  useEffect(() => {
    if (draftPresetId !== draftPreset.id) {
      setDraftPresetId(draftPreset.id)
    }
  }, [draftPresetId, draftPreset.id])

  // Dirty detection: any draft differs from its committed store value.
  // String-comparing the parsed max-tokens avoids false-positives on
  // the initial "16384" vs 16384 mismatch.
  const isDirty =
    draftConfig !== compileModelConfig ||
    Number(draftMaxTokens) !== compileMaxTokens ||
    draftPresetId !== compilePresetId

  const registerDirtyGuard = useRegisterDirtyGuard()
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  useEffect(() => {
    registerDirtyGuard(() => {
      if (!isDirtyRef.current) return true
      // eslint-disable-next-line no-alert
      return window.confirm('Discard unsaved compile settings?')
    })
    return () => registerDirtyGuard(null)
  }, [registerDirtyGuard])

  // Re-seed draft when store values change (e.g., another pane, the
  // startup loader, or a future "reset to defaults" feature updated
  // the persisted settings while the user wasn't in this pane).
  //
  // GATED on isDirtyRef.current — if the user has unsaved edits, the
  // re-seed is skipped to avoid silently discarding their typing.
  // The dirty guard remains true and the user gets the standard
  // discard prompt on pane switch. Without this gate, an unrelated
  // store update mid-edit would overwrite the draft AND collapse
  // isDirty to false, allowing a free pane switch with the work
  // already lost.
  //
  // The ref read happens at effect-fire time, so it always reflects
  // the latest isDirty value computed in the most recent render.
  useEffect(() => {
    if (isDirtyRef.current) return
    setDraftConfig(compileModelConfig)
    setDraftMaxTokens(String(compileMaxTokens))
    setDraftPresetId(compilePresetId)
  }, [compileModelConfig, compileMaxTokens, compilePresetId])

  const selectedLabel = draftConfig != null
    ? (getModelById(draftConfig.model, orModels)?.name ?? draftConfig.model.split('/').pop() ?? 'Model')
    : 'No default — picker will appear every compile'

  const handleSelectModel = useCallback((provider: string, model: string, keyId: string) => {
    setDraftConfig({ provider, model, keyId })
    setBrowseMode(false)
    setSaved(false)
  }, [])

  const handleClearDefault = useCallback(() => {
    setDraftConfig(null)
    setBrowseMode(false)
    setSaved(false)
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSaved(false)

    const parsedMax = Number(draftMaxTokens)
    if (!Number.isFinite(parsedMax) || parsedMax <= 0) {
      setError('Max output tokens must be a positive number')
      setSaving(false)
      return
    }
    // Upper bound: 2,000,000 tokens covers every current provider's
    // max output cap with comfortable headroom (Claude 4.5 caps at
    // 64k, GPT-4 caps at 16k, Gemini 2.0 Flash at 8k). A value
    // larger than this is almost certainly a typo (e.g., "1e10"
    // entered into the number input passes Number.isFinite). Without
    // this guard, the inflated value would be saved to disk and
    // every compile call would send it to the provider, which would
    // either reject with a confusing error or silently cap.
    if (parsedMax > 2_000_000) {
      setError('Max output tokens must be 2,000,000 or fewer (current models cap far below this).')
      setSaving(false)
      return
    }
    const validatedMax = Math.round(parsedMax)

    const api = (window as { consiliumAPI?: {
      configLoad(): Promise<{ values: Record<string, unknown> }>
      configSave(config: Record<string, unknown>): Promise<void>
    } }).consiliumAPI

    if (api == null) {
      setError('Configuration API not available')
      setSaving(false)
      return
    }

    try {
      // Wrap each IPC in a 10s timeout. Without it, a hung main
      // process (broken contextBridge, blocked event loop, etc.)
      // would leave saving=true forever and the Save button would be
      // permanently disabled with no recovery short of re-opening
      // the modal. The timeout rejects with a clear error message
      // so the user can retry.
      const current = await withTimeout(api.configLoad(), 10_000, 'Load timed out')
      await withTimeout(
        api.configSave({
          ...current.values,
          compileModelConfig: draftConfig,
          compileMaxTokens: validatedMax,
          compilePresetId: draftPresetId,
        }),
        10_000,
        'Save timed out',
      )
      setCompileModelConfig(draftConfig)
      setCompileMaxTokens(validatedMax)
      setCompilePresetId(draftPresetId)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [draftConfig, draftMaxTokens, draftPresetId, setCompileModelConfig, setCompileMaxTokens, setCompilePresetId])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge-subtle px-6 py-4">
        <h3 className="text-sm font-semibold text-content-primary">Compile</h3>
        <p className="mt-1 text-xs text-content-muted">
          Default style, model, and output limits for the Compile Document button.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <p className="mb-4 text-xs text-content-muted">
          Compile Document is an isolated API call — it does not run as one of the advisors. The
          compiled result lands in the Documents panel on the right, not in the chat thread.
        </p>

        {/* Default preset */}
        <div className="mb-4">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted">
            Default Style
          </label>
          <p className="mb-2 text-[10px] text-content-disabled">
            Each style is a different prompt template that shapes the output. Users can override
            per-compile in the picker.
          </p>
          <select
            value={draftPresetId}
            onChange={(e) => {
              setDraftPresetId(e.target.value)
              setSaved(false)
            }}
            className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
          >
            {mergedCompilePrompts.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
                {!preset.isBuiltIn ? ' · custom' : ''}
              </option>
            ))}
          </select>
          {draftPreset.description !== '' && (
            <p className="mt-1.5 text-[10px] italic text-content-disabled">
              {draftPreset.description}
            </p>
          )}
        </div>

        {/* Default model */}
        <div className="mb-4">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted">
            Default Compile Model
          </label>
          <p className="mb-2 text-[10px] text-content-disabled">
            The model used when you click Compile Document without overriding. You can still pick a
            different model per-compile.
          </p>

          <div className="mb-2 flex items-center gap-2 rounded-md border border-edge-subtle bg-surface-base px-3 py-2">
            <span
              className={`text-xs ${draftConfig != null ? 'text-content-primary' : 'italic text-content-disabled'}`}
            >
              {selectedLabel}
            </span>
          </div>

          {!browseMode ? (
            <div className="flex gap-2">
              <button
                onClick={() => setBrowseMode(true)}
                disabled={keys.length === 0}
                className="flex-1 rounded-md border border-dashed border-edge-subtle px-3 py-1.5 text-xs text-content-muted transition-colors hover:border-edge-focus hover:text-content-primary disabled:opacity-50"
              >
                {keys.length === 0 ? 'No API keys configured' : 'Pick a model…'}
              </button>
              {draftConfig != null && (
                <button
                  onClick={handleClearDefault}
                  className="rounded-md border border-edge-subtle px-3 py-1.5 text-xs text-content-muted hover:bg-surface-hover hover:text-content-primary"
                >
                  Clear
                </button>
              )}
            </div>
          ) : (
            <BrowseModels onSelect={handleSelectModel} onBack={() => setBrowseMode(false)} />
          )}
        </div>

        {/* Max tokens */}
        <div className="mb-4">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted">
            Max Output Tokens
          </label>
          <p className="mb-2 text-[10px] text-content-disabled">
            Output cap for compile calls. Higher values let the document grow longer before being
            truncated. Default 16384. The provider may cap server-side. Lower this to save cost on
            long compiles; raise it if your model supports more.
          </p>
          <input
            type="number"
            min={1}
            value={draftMaxTokens}
            onChange={(e) => {
              setDraftMaxTokens(e.target.value)
              setSaved(false)
            }}
            className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
          />
        </div>

        {/* Footer — per-pane save */}
        <div className="mt-6 flex items-center justify-between border-t border-edge-subtle pt-3">
          <div className="text-[10px]">
            {error != null && <span className="text-error">{error}</span>}
            {saved && error == null && <span className="text-accent-green">Saved.</span>}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-accent-blue px-4 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// (BrowseModels and BrowseModelsList moved to ./BrowseModels.tsx and
// shared with AutoCompactionSettingsPane.)
