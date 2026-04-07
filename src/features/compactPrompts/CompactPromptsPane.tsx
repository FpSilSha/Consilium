import { type ReactNode, useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { useRegisterDirtyGuard } from '@/features/configuration/dirty-guard'
import { withTimeout } from '@/features/configuration/with-timeout'
import { generateCustomLibraryId } from '@/features/personas/persona-validators'
import { BUILT_IN_COMPACT_PROMPTS, BUILT_IN_COMPACT_PROMPT_ID } from './built-in-compact-prompts'
import { getMergedCompactPrompts } from './compact-prompts-resolver'
import type { CustomCompactPrompt } from './types'

/**
 * Compact Prompts pane — fourth and final native library pane in
 * ConfigurationModal.
 *
 * Single category, no off mode. The library has one built-in base
 * entry (the historical buildSummaryPrompt content extracted into
 * a library-friendly form) plus user customs. An "active" dropdown
 * at the top selects which template both the manual Compact button
 * and the auto-compaction pipeline use — there's only one selection
 * field, so the two consumers are always in sync.
 *
 * Per-entry fields:
 *   - name     — short display name
 *   - content  — the template body (should include {messages} so the
 *                archive is substituted into the prompt)
 *
 * Create form validation:
 *   - name: required, max 60 chars
 *   - content: optional (empty allowed with a soft warning), max 16,000 chars
 */

const MAX_NAME_LENGTH = 60
const MAX_CONTENT_LENGTH = 16_000

interface CompactPromptsAPI {
  compactPromptsSave: (entry: Record<string, unknown>) => Promise<void>
  compactPromptsDelete: (id: string) => Promise<boolean>
}

interface ConfigAPI {
  configLoad: () => Promise<{ values: Record<string, unknown>; descriptions: Record<string, string> }>
  configSave: (config: Record<string, unknown>) => Promise<void>
}

function getPromptsAPI(): CompactPromptsAPI | null {
  if (typeof window === 'undefined') return null
  return (window as { consiliumAPI?: CompactPromptsAPI }).consiliumAPI ?? null
}

function getConfigAPI(): ConfigAPI | null {
  if (typeof window === 'undefined') return null
  return (window as { consiliumAPI?: ConfigAPI }).consiliumAPI ?? null
}

export function CompactPromptsPane(): ReactNode {
  const customs = useStore((s) => s.customCompactPrompts)
  const compactPromptId = useStore((s) => s.compactPromptId)
  const addCustom = useStore((s) => s.addCustomCompactPrompt)
  const removeCustom = useStore((s) => s.removeCustomCompactPrompt)
  const setCompactPromptId = useStore((s) => s.setCompactPromptId)

  const [showForm, setShowForm] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const merged = useMemo(() => getMergedCompactPrompts(customs), [customs])

  // Self-heal: if the persisted compactPromptId references a custom
  // that no longer exists, fall back to the built-in base entry in
  // the DISPLAY. The actual disk rewrite happens in handleDelete
  // when the user explicitly deletes the selected entry, OR in the
  // startup loader on next launch.
  const resolvedActiveId = merged.some((e) => e.id === compactPromptId)
    ? compactPromptId
    : BUILT_IN_COMPACT_PROMPT_ID

  const persistSelection = useCallback(
    async (id: string): Promise<void> => {
      setSaveError(null)
      const configApi = getConfigAPI()
      if (configApi == null) {
        setSaveError('Config API not available')
        return
      }
      try {
        const { values } = await configApi.configLoad()
        await configApi.configSave({ ...values, compactPromptId: id })
        setCompactPromptId(id)
      } catch (err) {
        console.error('[compact-prompts] failed to persist selection:', err)
        setSaveError(err instanceof Error ? err.message : 'Failed to save')
      }
    },
    [setCompactPromptId],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      setDeleteError(null)
      const api = getPromptsAPI()
      if (api == null) {
        removeCustom(id)
        return
      }
      // Disk-first: abort store mutation on IPC failure.
      try {
        await withTimeout(api.compactPromptsDelete(id), 10_000, 'Delete timed out')
      } catch (err) {
        console.error('[compact-prompts] failed to delete from disk:', err)
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
      // Self-heal the active selection if the deleted entry was the
      // currently-selected template.
      if (compactPromptId === id) {
        await persistSelection(BUILT_IN_COMPACT_PROMPT_ID)
      }
    },
    [removeCustom, compactPromptId, persistSelection],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge-subtle px-6 py-4">
        <h3 className="text-sm font-semibold text-content-primary">Compact Prompts</h3>
        <p className="mt-1 text-xs text-content-muted">
          The prompt template used by both manual Compact and auto-compaction. Use the{' '}
          <code className="rounded bg-surface-hover px-1 py-0.5 text-[10px]">{'{messages}'}</code>{' '}
          placeholder where you want the archive content to be substituted.
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
        {/* Active template selector */}
        <div>
          <label
            htmlFor="compact-active-select"
            className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted"
          >
            Active template
          </label>
          <select
            id="compact-active-select"
            value={resolvedActiveId}
            onChange={(e) => void persistSelection(e.target.value)}
            className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
          >
            {merged.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
                {entry.isBuiltIn ? ' (base)' : ' · custom'}
              </option>
            ))}
          </select>
          {saveError != null && (
            <p className="mt-1 text-[10px] text-error">{saveError}</p>
          )}
          {resolvedActiveId !== compactPromptId && (
            <p className="mt-1 text-[10px] italic text-content-disabled">
              Your previous selection referenced a deleted custom — showing the base template
              instead. Pick another and save to update the stored selection.
            </p>
          )}
        </div>

        {/* Base entries */}
        <p className="text-[10px] font-medium uppercase tracking-wider text-content-muted">
          Base ({BUILT_IN_COMPACT_PROMPTS.length})
        </p>
        {BUILT_IN_COMPACT_PROMPTS.map((entry) => (
          <CompactPromptRow
            key={entry.id}
            name={entry.name}
            content={entry.content}
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
            No custom compact prompts yet. Click "New compact prompt" to create one — start from
            the base template or write your own.
          </p>
        )}
        {customs.map((entry) => {
          const isEmpty = entry.content.trim() === ''
          const badgeProps = isEmpty ? { badge: 'empty' as const } : {}
          return (
            <CompactPromptRow
              key={entry.id}
              name={entry.name}
              content={entry.content}
              onDelete={() => handleDelete(entry.id)}
              {...badgeProps}
            />
          )
        })}

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
            + New compact prompt
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Row — expandable display, optional delete
// ─────────────────────────────────────────────────────────────────────────

function CompactPromptRow({
  name,
  content,
  badge,
  readOnly = false,
  onDelete,
}: {
  readonly name: string
  readonly content: string
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
          <span className="truncate text-xs font-medium text-content-primary">{name}</span>
          {badge != null && (
            <span className="rounded bg-surface-hover px-1.5 py-0 text-[9px] uppercase tracking-wider text-content-disabled">
              {badge}
            </span>
          )}
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
            {content || '(empty)'}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// CreateForm
// ─────────────────────────────────────────────────────────────────────────

function CreateForm({
  onCancel,
  onCreated,
}: {
  readonly onCancel: () => void
  readonly onCreated: (entry: CustomCompactPrompt) => void
}): ReactNode {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [templateId, setTemplateId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const customs = useStore((s) => s.customCompactPrompts)
  const templates = useMemo(
    () => [...BUILT_IN_COMPACT_PROMPTS, ...customs],
    [customs],
  )

  const trimmedName = name.trim()
  const nameError =
    trimmedName.length === 0
      ? 'Name is required.'
      : trimmedName.length > MAX_NAME_LENGTH
        ? `Name must be ${MAX_NAME_LENGTH} characters or fewer.`
        : null
  // Content validation is strict because a malformed compact prompt
  // silently corrupts sessions: the template is sent verbatim to the
  // summarization model, which then returns a "summary" that REPLACES
  // the archive. The two failure modes that are functionally
  // destructive but not otherwise obvious:
  //
  //   1. Empty content — resolves to an empty prompt. Model either
  //      errors or generates garbage unrelated to the conversation,
  //      and that garbage overwrites the archive.
  //   2. Non-empty content missing the `{messages}` placeholder — the
  //      substitution is a no-op, so the model receives the template
  //      body with ZERO conversation context and confidently
  //      hallucinates a summary. Same outcome: corrupted archive.
  //
  // Both are now save-blocking errors rather than soft warnings.
  // Users who deliberately want a no-op template should select "Off"
  // in a future system-prompt-style toggle — which this library
  // doesn't expose because compaction always needs a real prompt.
  const contentError =
    content.trim().length === 0
      ? 'Content is required — empty templates silently corrupt the conversation archive.'
      : !content.includes('{messages}')
        ? 'Template must include the {messages} placeholder so the conversation is passed to the model.'
        : content.length > MAX_CONTENT_LENGTH
          ? `Content must be ${MAX_CONTENT_LENGTH.toLocaleString()} characters or fewer.`
          : null
  const hasErrors = nameError != null || contentError != null

  const isDirty = name.length > 0 || content.length > 0
  const registerDirtyGuard = useRegisterDirtyGuard()
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  useEffect(() => {
    registerDirtyGuard(() => {
      if (!isDirtyRef.current) return true
      // eslint-disable-next-line no-alert
      return window.confirm('Discard unsaved compact prompt?')
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
      if (content.length > 0) {
        // eslint-disable-next-line no-alert
        const ok = window.confirm('Replace the current content with the template?')
        if (!ok) return
      }
      setTemplateId(id)
      setContent(template.content)
    },
    [templates, content.length],
  )

  const handleSubmit = useCallback(async () => {
    if (hasErrors) return
    setServerError(null)
    setSubmitting(true)

    const id = generateCustomLibraryId('compactprompt', trimmedName)
    const now = Date.now()
    const stored = {
      id,
      name: trimmedName,
      content,
      createdAt: now,
      updatedAt: now,
    }

    const api = getPromptsAPI()
    if (api == null) {
      setServerError('Compact prompt API not available')
      setSubmitting(false)
      return
    }
    try {
      await withTimeout(api.compactPromptsSave(stored), 10_000, 'Save timed out')
      setSubmitting(false)
      const entry: CustomCompactPrompt = { ...stored }
      onCreated(entry)
    } catch (err) {
      console.error('[compact-prompts] save failed:', err)
      const raw = err instanceof Error ? err.message : String(err)
      const friendly = raw.includes('ENOSPC')
        ? 'Could not save: disk is full.'
        : raw.includes('EACCES') || raw.includes('EROFS')
          ? 'Could not save: permission denied or read-only volume.'
          : `Could not save prompt. ${raw}`
      setServerError(friendly)
      setSubmitting(false)
    }
  }, [hasErrors, trimmedName, content, onCreated])

  return (
    <div className="rounded-md border border-edge-focus bg-surface-base/60 p-4">
      <h4 className="text-xs font-semibold text-content-primary">New custom compact prompt</h4>

      <div className="mt-3">
        <label
          htmlFor="compactprompt-template"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted"
        >
          Start from a template (optional)
        </label>
        <select
          id="compactprompt-template"
          value={templateId}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
        >
          <option value="">— None (start blank) —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {BUILT_IN_COMPACT_PROMPTS.some((b) => b.id === t.id) ? ' (base)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        <label
          htmlFor="compactprompt-name"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted"
        >
          Name ({trimmedName.length}/{MAX_NAME_LENGTH})
        </label>
        <input
          id="compactprompt-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Terse Summarizer"
          className={`w-full rounded-md border bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus ${
            nameError != null ? 'border-error' : 'border-edge-subtle'
          }`}
        />
        {nameError != null && <p className="mt-1 text-[10px] text-error">{nameError}</p>}
      </div>

      <div className="mt-3">
        <label
          htmlFor="compactprompt-content"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted"
        >
          Template ({content.length.toLocaleString()}/{MAX_CONTENT_LENGTH.toLocaleString()})
          <span className="ml-2 normal-case text-content-disabled">
            · use{' '}
            <code className="rounded bg-surface-hover px-1 py-0.5 text-[10px]">{'{messages}'}</code>{' '}
            to inject the archive
          </span>
        </label>
        <textarea
          id="compactprompt-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          placeholder="Summarize in 3 bullets:&#10;&#10;{messages}"
          className={`w-full resize-y rounded-md border bg-surface-base px-3 py-2 text-xs text-content-primary outline-none focus:border-edge-focus ${
            contentError != null ? 'border-error' : 'border-edge-subtle'
          }`}
        />
        {contentError != null && <p className="mt-1 text-[10px] text-error">{contentError}</p>}
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
