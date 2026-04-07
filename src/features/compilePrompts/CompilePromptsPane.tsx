import { type ReactNode, useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { useRegisterDirtyGuard } from '@/features/configuration/dirty-guard'
import { withTimeout } from '@/features/configuration/with-timeout'
import { generateCustomLibraryId } from '@/features/personas/persona-validators'
import { COMPILE_PRESETS } from '@/features/chat/compile-presets'
import type { CustomCompilePrompt } from './types'

/**
 * Compile Prompts pane — third native pane in ConfigurationModal.
 *
 * Simpler than System Prompts:
 *   - One category (no sub-sections, no tabs).
 *   - No off mode. Every compile call MUST have a prompt (the model
 *     can't do a compile with no instructions).
 *   - The 5 existing built-in presets become read-only "base" entries.
 *   - User can create / edit / delete "custom" entries. Custom entries
 *     appear in the Compile Document dropdown and the Compile Settings
 *     default-preset dropdown alongside the base presets automatically.
 *
 * Per-entry fields (for both base and custom):
 *   - label          — short dropdown label (e.g., "Comprehensive Report")
 *   - description    — italic hint shown below the dropdown in the
 *                      Compile Document popover
 *   - prompt         — the actual instruction text sent to the model
 *                      as the final user message of the compile call
 *
 * Create form validation:
 *   - label: required, max 60 chars
 *   - description: optional, max 200 chars
 *   - prompt: required, max 16,000 chars
 *
 * Save flow is disk-first, store-second (mirrors the personas and
 * system prompts panes). On success, the new custom appears in the
 * dropdown lists across the app instantly.
 */

const MAX_LABEL_LENGTH = 60
const MAX_DESCRIPTION_LENGTH = 200
const MAX_PROMPT_LENGTH = 16_000

interface CompilePromptsAPI {
  compilePromptsSave: (entry: Record<string, unknown>) => Promise<void>
  compilePromptsDelete: (id: string) => Promise<boolean>
}

function getAPI(): CompilePromptsAPI | null {
  if (typeof window === 'undefined') return null
  return (window as { consiliumAPI?: CompilePromptsAPI }).consiliumAPI ?? null
}

export function CompilePromptsPane(): ReactNode {
  const customs = useStore((s) => s.customCompilePrompts)
  const addCustom = useStore((s) => s.addCustomCompilePrompt)
  const removeCustom = useStore((s) => s.removeCustomCompilePrompt)
  const globalCompilePresetId = useStore((s) => s.compilePresetId)
  const setCompilePresetId = useStore((s) => s.setCompilePresetId)

  const [showForm, setShowForm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = useCallback(
    async (id: string) => {
      setDeleteError(null)
      const api = getAPI()
      if (api == null) {
        // Running outside Electron — safe to update store directly
        // since there's no disk to desync from.
        removeCustom(id)
        return
      }
      // Disk-first: abort the store mutation if the disk delete fails.
      // Without this, a transient IPC failure (EACCES, EROFS, disk full
      // on the tmp path) would leave the entry on disk while the store
      // removes it — the next app launch would re-load and "resurrect"
      // the deleted entry with no explanation to the user. Matches the
      // disk-first save pattern used by the other library panes.
      try {
        await withTimeout(api.compilePromptsDelete(id), 10_000, 'Delete timed out')
      } catch (err) {
        console.error('[compile-prompts] failed to delete from disk:', err)
        const raw = err instanceof Error ? err.message : String(err)
        const friendly = raw.includes('ENOSPC')
          ? 'Could not delete: disk is full.'
          : raw.includes('EACCES') || raw.includes('EROFS')
            ? 'Could not delete: permission denied or read-only volume.'
            : `Could not delete prompt. ${raw}`
        setDeleteError(friendly)
        return
      }
      removeCustom(id)
      // Self-heal the global default if the deleted entry was
      // referenced by compilePresetId in config. Without this, the
      // global default would point at a missing custom, triggering
      // silent fallback to 'comprehensive' on every subsequent
      // compile with no user feedback.
      if (globalCompilePresetId === id) {
        const configApi = (
          window as { consiliumAPI?: { configLoad: () => Promise<{ values: Record<string, unknown>; descriptions: Record<string, string> }>; configSave: (config: Record<string, unknown>) => Promise<void> } }
        ).consiliumAPI
        if (configApi != null) {
          try {
            const { values } = await configApi.configLoad()
            await configApi.configSave({ ...values, compilePresetId: 'comprehensive' })
          } catch (err) {
            console.error('[compile-prompts] failed to reset global default after delete:', err)
          }
        }
        setCompilePresetId('comprehensive')
      }
    },
    [removeCustom, globalCompilePresetId, setCompilePresetId],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge-subtle px-6 py-4">
        <h3 className="text-sm font-semibold text-content-primary">Compile Prompts</h3>
        <p className="mt-1 text-xs text-content-muted">
          The 5 base presets ship with the app. Add your own custom compile prompts — they'll
          appear in the Compile Document dropdown and the default-preset picker automatically.
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
        {/* Base entries — read-only */}
        <p className="text-[10px] font-medium uppercase tracking-wider text-content-muted">
          Base ({COMPILE_PRESETS.length})
        </p>
        {COMPILE_PRESETS.map((preset) => (
          <CompilePromptRow
            key={preset.id}
            label={preset.label}
            description={preset.description}
            prompt={preset.prompt}
            badge="base"
            readOnly
          />
        ))}

        {/* Custom entries */}
        <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-content-muted">
          Custom ({customs.length})
        </p>
        {deleteError != null && (
          <p className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-[11px] text-error">
            {deleteError}
          </p>
        )}
        {customs.length === 0 && !showForm && (
          <p className="text-xs italic text-content-disabled">
            No custom compile prompts yet. Click "New compile prompt" to create one — start from
            a base template or write your own.
          </p>
        )}
        {customs.map((entry) => (
          <CompilePromptRow
            key={entry.id}
            label={entry.label}
            description={entry.description}
            prompt={entry.prompt}
            onDelete={() => handleDelete(entry.id)}
          />
        ))}

        {showForm ? (
          <CreateForm
            onCancel={() => setShowForm(false)}
            onCreated={(entry) => {
              addCustom(entry)
              setShowForm(false)
            }}
          />
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="self-start rounded-md border border-dashed border-edge-subtle px-3 py-1.5 text-xs text-content-muted transition-colors hover:border-edge-focus hover:text-content-primary"
          >
            + New compile prompt
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Row — shows label + description + expandable full prompt
// ─────────────────────────────────────────────────────────────────────────

function CompilePromptRow({
  label,
  description,
  prompt,
  badge,
  readOnly = false,
  onDelete,
}: {
  readonly label: string
  readonly description: string
  readonly prompt: string
  readonly badge?: string
  readonly readOnly?: boolean
  readonly onDelete?: () => void
}): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="rounded-md border border-edge-subtle bg-surface-base/40">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="text-[10px] text-content-disabled" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-medium text-content-primary">{label}</span>
              {badge != null && (
                <span
                  className={`rounded px-1.5 py-0 text-[9px] font-medium uppercase tracking-wider ${
                    badge === 'base'
                      ? 'bg-accent-blue/15 text-accent-blue'
                      : 'bg-surface-hover text-content-muted'
                  }`}
                >
                  {badge}
                </span>
              )}
            </div>
            {description !== '' && (
              <div className="truncate text-[10px] italic text-content-disabled">{description}</div>
            )}
          </div>
        </button>

        {!readOnly && onDelete != null && (
          <>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded px-2 py-0.5 text-[10px] text-error transition-colors hover:bg-error/10"
              >
                Delete
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    onDelete()
                    setConfirmDelete(false)
                  }}
                  className="rounded bg-error px-2 py-0.5 text-[10px] font-medium text-content-inverse hover:bg-error/90"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded px-2 py-0.5 text-[10px] text-content-muted transition-colors hover:bg-surface-hover"
                >
                  Cancel
                </button>
              </>
            )}
          </>
        )}
      </div>
      {expanded && (
        <div className="border-t border-edge-subtle px-3 py-2">
          <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-content-muted">
            {prompt}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// CreateForm — inline new-entry form
// ─────────────────────────────────────────────────────────────────────────

function CreateForm({
  onCancel,
  onCreated,
}: {
  readonly onCancel: () => void
  readonly onCreated: (entry: CustomCompilePrompt) => void
}): ReactNode {
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [templateId, setTemplateId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const customs = useStore((s) => s.customCompilePrompts)
  // Starter templates = base presets + existing customs. Picking one
  // pre-fills description + prompt (label is left alone so the user
  // is forced to choose a unique name).
  const templates = useMemo(
    () => [...COMPILE_PRESETS, ...customs],
    [customs],
  )

  const trimmedLabel = label.trim()
  const labelError =
    trimmedLabel.length === 0
      ? 'Label is required.'
      : trimmedLabel.length > MAX_LABEL_LENGTH
        ? `Label must be ${MAX_LABEL_LENGTH} characters or fewer.`
        : null
  const descriptionError =
    description.length > MAX_DESCRIPTION_LENGTH
      ? `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`
      : null
  const promptError =
    prompt.trim().length === 0
      ? 'Prompt is required.'
      : prompt.length > MAX_PROMPT_LENGTH
        ? `Prompt must be ${MAX_PROMPT_LENGTH.toLocaleString()} characters or fewer.`
        : null
  const hasErrors = labelError != null || descriptionError != null || promptError != null

  const isDirty = label.length > 0 || description.length > 0 || prompt.length > 0
  const registerDirtyGuard = useRegisterDirtyGuard()
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  useEffect(() => {
    registerDirtyGuard(() => {
      if (!isDirtyRef.current) return true
      // eslint-disable-next-line no-alert
      return window.confirm('Discard unsaved compile prompt?')
    })
    return () => registerDirtyGuard(null)
  }, [registerDirtyGuard])

  const handleTemplateChange = useCallback(
    (id: string) => {
      if (id === '') {
        setTemplateId('')
        return
      }
      const template = templates.find((t) => t.id === id)
      if (template == null) return
      if (description.length > 0 || prompt.length > 0) {
        // eslint-disable-next-line no-alert
        const ok = window.confirm(
          'Replace the current description and prompt with the template?',
        )
        if (!ok) return
      }
      setTemplateId(id)
      setDescription(template.description)
      setPrompt(template.prompt)
    },
    [templates, description.length, prompt.length],
  )

  const handleSubmit = useCallback(async () => {
    if (hasErrors) return
    setServerError(null)
    setSubmitting(true)

    const id = generateCustomLibraryId('compileprompt', trimmedLabel)
    const now = Date.now()
    // Plain object (not typed as CustomCompilePrompt) so the readonly
    // fields don't block it from flowing into the Record<string,
    // unknown> parameter type on compilePromptsSave. The renderer
    // synthesizes the CustomCompilePrompt shape afterward when
    // handing off to the store.
    const stored = {
      id,
      label: trimmedLabel,
      description: description.trim(),
      prompt,
      createdAt: now,
      updatedAt: now,
    }

    const api = getAPI()
    if (api == null) {
      setServerError('Compile prompt API not available')
      setSubmitting(false)
      return
    }
    try {
      await withTimeout(api.compilePromptsSave(stored), 10_000, 'Save timed out')
      setSubmitting(false)
      const entry: CustomCompilePrompt = { ...stored }
      onCreated(entry)
    } catch (err) {
      console.error('[compile-prompts] save failed:', err)
      const raw = err instanceof Error ? err.message : String(err)
      const friendly = raw.includes('ENOSPC')
        ? 'Could not save: disk is full.'
        : raw.includes('EACCES') || raw.includes('EROFS')
          ? 'Could not save: permission denied or read-only volume.'
          : `Could not save prompt. ${raw}`
      setServerError(friendly)
      setSubmitting(false)
    }
  }, [hasErrors, trimmedLabel, description, prompt, onCreated])

  return (
    <div className="rounded-md border border-edge-focus bg-surface-base/60 p-4">
      <h4 className="text-xs font-semibold text-content-primary">New custom compile prompt</h4>

      <div className="mt-3">
        <label
          htmlFor="compileprompt-template"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted"
        >
          Start from a template (optional)
        </label>
        <select
          id="compileprompt-template"
          value={templateId}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
        >
          <option value="">— None (start blank) —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
              {COMPILE_PRESETS.some((b) => b.id === t.id) ? ' (base)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        <label
          htmlFor="compileprompt-label"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted"
        >
          Label ({trimmedLabel.length}/{MAX_LABEL_LENGTH})
        </label>
        <input
          id="compileprompt-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Technical Spec"
          className={`w-full rounded-md border bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus ${
            labelError != null ? 'border-error' : 'border-edge-subtle'
          }`}
        />
        {labelError != null && <p className="mt-1 text-[10px] text-error">{labelError}</p>}
      </div>

      <div className="mt-3">
        <label
          htmlFor="compileprompt-description"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted"
        >
          Description ({description.length}/{MAX_DESCRIPTION_LENGTH})
        </label>
        <input
          id="compileprompt-description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detailed technical writeup from the conversation"
          className={`w-full rounded-md border bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus ${
            descriptionError != null ? 'border-error' : 'border-edge-subtle'
          }`}
        />
        {descriptionError != null && (
          <p className="mt-1 text-[10px] text-error">{descriptionError}</p>
        )}
      </div>

      <div className="mt-3">
        <label
          htmlFor="compileprompt-prompt"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted"
        >
          Prompt ({prompt.length.toLocaleString()}/{MAX_PROMPT_LENGTH.toLocaleString()})
        </label>
        <textarea
          id="compileprompt-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={12}
          placeholder="Produce a detailed technical specification from the conversation above..."
          className={`w-full resize-y rounded-md border bg-surface-base px-3 py-2 text-xs text-content-primary outline-none focus:border-edge-focus ${
            promptError != null ? 'border-error' : 'border-edge-subtle'
          }`}
        />
        {promptError != null && <p className="mt-1 text-[10px] text-error">{promptError}</p>}
      </div>

      {serverError != null && (
        <p className="mt-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-[11px] text-error">
          {serverError}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={hasErrors || submitting}
          className="rounded-md bg-accent-blue px-4 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save prompt'}
        </button>
      </div>
    </div>
  )
}
