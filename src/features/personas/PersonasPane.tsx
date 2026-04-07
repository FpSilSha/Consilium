import { type ReactNode, useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useStore } from '@/store'
// Import directly from the dirty-guard module (NOT the configuration
// barrel) to avoid the circular dependency PersonasPane -> barrel ->
// ConfigurationModal -> PersonasPane. The barrel re-exports
// useRegisterDirtyGuard for non-pane consumers; native panes should
// always use this direct path.
import { useRegisterDirtyGuard } from '@/features/configuration/dirty-guard'
import { withTimeout } from '@/features/configuration/with-timeout'
import {
  validatePersonaInput,
  generateCustomPersonaId,
  toPersona,
  MAX_PERSONA_NAME_LENGTH,
  MAX_PERSONA_CONTENT_LENGTH,
} from './persona-validators'
import { BUILT_IN_PERSONAS } from './built-in-personas'
import type { Persona } from '@/types'

/**
 * Personas pane — first NATIVE pane in the ConfigurationModal sidebar
 * (every other pane is currently placeholder or legacy link-out).
 *
 * Two top-level tabs:
 *
 *   Base    — read-only list of the built-in personas. Each row expands
 *             to show the prompt content. No edit/delete actions.
 *
 *   Custom  — full CRUD over user-created personas. Lists existing
 *             customs (if any), shows a "+ New persona" button that
 *             reveals an inline create form, and exposes Edit/Delete on
 *             each custom row. Delete requires a confirm step.
 *
 * The create form supports starting from a template (any built-in
 * persona) — picking a template pre-fills the content textarea with the
 * built-in's prompt body. Users can then edit freely. The template is a
 * starting point, not a binding — there's no live link from the custom
 * persona to the template after creation.
 *
 * The pane registers a dirty-state guard with ConfigurationModal via
 * useRegisterDirtyGuard so the user is warned before switching panes if
 * the create form has unsaved input.
 *
 * Save flow (disk-first, store-second):
 *   1. Validate name + content client-side
 *   2. Generate stable ID via generateCustomPersonaId
 *   3. Call consiliumAPI.personasSave(stored) — wait for the IPC promise
 *   4. On success, dispatch addCustomPersona to the Zustand store
 *   5. Reset the form
 *
 * If the IPC fails, the store is NOT updated and the form shows an
 * error message. This avoids a desync where the UI shows a persona that
 * doesn't actually exist on disk.
 */

type Tab = 'base' | 'custom'

export function PersonasPane(): ReactNode {
  const [tab, setTab] = useState<Tab>('base')
  const customPersonas = useStore((s) => s.customPersonas)
  const addCustomPersona = useStore((s) => s.addCustomPersona)
  const removeCustomPersona = useStore((s) => s.removeCustomPersona)

  // Inline state for delete errors. The original implementation
  // updated the store unconditionally even on IPC failure, which
  // produced a "ghost resurrection" on next launch. Now matches
  // the disk-first abort pattern used by the other library panes:
  // store mutation runs ONLY if the disk delete succeeds, and the
  // user sees a friendly error message in-pane on failure.
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = useCallback(
    async (id: string) => {
      setDeleteError(null)
      const api = (
        window as { consiliumAPI?: { personasDelete: (id: string) => Promise<boolean> } }
      ).consiliumAPI
      if (api == null) {
        // No Electron — safe to update store directly.
        removeCustomPersona(id)
        return
      }
      try {
        await withTimeout(api.personasDelete(id), 10_000, 'Delete timed out')
      } catch (err) {
        console.error('[personas] failed to delete from disk:', err)
        const raw = err instanceof Error ? err.message : String(err)
        const friendly = raw.includes('ENOSPC')
          ? 'Could not delete: disk is full.'
          : raw.includes('EACCES') || raw.includes('EROFS')
            ? 'Could not delete: permission denied or read-only volume.'
            : `Could not delete persona. ${raw}`
        setDeleteError(friendly)
        return
      }
      removeCustomPersona(id)
    },
    [removeCustomPersona],
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header with tabs */}
      <div className="border-b border-edge-subtle px-6 pt-4">
        <h3 className="text-sm font-semibold text-content-primary">Personas</h3>
        <p className="mt-1 text-xs text-content-muted">
          Built-in personas ship with the app. Custom personas are yours to create, edit, and delete.
        </p>
        <div className="mt-3 flex gap-1">
          <TabButton active={tab === 'base'} onClick={() => setTab('base')}>
            Base ({BUILT_IN_PERSONAS.length})
          </TabButton>
          <TabButton active={tab === 'custom'} onClick={() => setTab('custom')}>
            Custom ({customPersonas.length})
          </TabButton>
        </div>
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {deleteError != null && (
          <p className="mb-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-[11px] text-error">
            {deleteError}
          </p>
        )}
        {tab === 'base' ? (
          <BaseTab />
        ) : (
          <CustomTab
            customs={customPersonas}
            onAdd={addCustomPersona}
            onRemove={handleDelete}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Tab button — small atom shared between Base and Custom tabs
// ─────────────────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  readonly active: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}): ReactNode {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-b-2 border-accent-blue text-content-primary'
          : 'border-b-2 border-transparent text-content-muted hover:text-content-primary'
      }`}
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Base tab — read-only list of built-in personas
// ─────────────────────────────────────────────────────────────────────────

function BaseTab(): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      {BUILT_IN_PERSONAS.map((persona) => (
        <PersonaRow key={persona.id} persona={persona} readOnly />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Custom tab — CRUD over user-created personas
// ─────────────────────────────────────────────────────────────────────────

function CustomTab({
  customs,
  onAdd,
  onRemove,
}: {
  readonly customs: readonly Persona[]
  readonly onAdd: (persona: Persona) => void
  readonly onRemove: (id: string) => void
}): ReactNode {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      {customs.length === 0 && !showForm && (
        <p className="text-xs italic text-content-disabled">
          No custom personas yet. Click "New persona" to create one — start from a built-in template
          or write your own from scratch.
        </p>
      )}

      {customs.map((persona) => (
        <PersonaRow key={persona.id} persona={persona} onDelete={() => onRemove(persona.id)} />
      ))}

      {showForm ? (
        <CreateForm
          onCancel={() => setShowForm(false)}
          onCreated={(persona) => {
            onAdd(persona)
            setShowForm(false)
          }}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="self-start rounded-md border border-dashed border-edge-subtle px-3 py-1.5 text-xs text-content-muted transition-colors hover:border-edge-focus hover:text-content-primary"
        >
          + New persona
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// PersonaRow — collapsible row showing name + expand-to-see-content
// ─────────────────────────────────────────────────────────────────────────

function PersonaRow({
  persona,
  readOnly = false,
  onDelete,
}: {
  readonly persona: Persona
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
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <span className="text-[10px] text-content-disabled" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="truncate text-xs font-medium text-content-primary">{persona.name}</span>
          {persona.isBuiltIn && (
            <span className="rounded bg-surface-hover px-1.5 py-0 text-[9px] font-medium uppercase tracking-wider text-content-muted">
              base
            </span>
          )}
        </button>

        {!readOnly && onDelete != null && (
          <>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded px-2 py-0.5 text-[10px] text-error transition-colors hover:bg-error/10"
                aria-label={`Delete ${persona.name}`}
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
            {persona.content || '(empty)'}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// CreateForm — inline create form for new custom personas
// ─────────────────────────────────────────────────────────────────────────

function CreateForm({
  onCancel,
  onCreated,
}: {
  readonly onCancel: () => void
  readonly onCreated: (persona: Persona) => void
}): ReactNode {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [templateId, setTemplateId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  // Validation runs every render so the save button reflects current
  // input state. Cheap — the validators are pure and tiny.
  const errors = useMemo(() => validatePersonaInput(name, content), [name, content])
  const errorByField = useMemo(() => {
    const map = new Map<string, string>()
    for (const err of errors) map.set(err.field, err.message)
    return map
  }, [errors])

  // Dirty if the user has typed anything. Used to register the
  // pane-switch guard with ConfigurationModal so they're warned before
  // navigating away with unsaved input.
  const isDirty = name.length > 0 || content.length > 0
  const registerDirtyGuard = useRegisterDirtyGuard()
  // Hold the latest dirty state in a ref so the registered guard
  // function reads the current value rather than a stale closure.
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  useEffect(() => {
    registerDirtyGuard(() => {
      if (!isDirtyRef.current) return true
      // eslint-disable-next-line no-alert
      return window.confirm('Discard unsaved persona?')
    })
    return () => registerDirtyGuard(null)
  }, [registerDirtyGuard])

  const handleTemplateChange = useCallback((id: string) => {
    if (id === '') {
      setTemplateId('')
      return
    }
    const template = BUILT_IN_PERSONAS.find((p) => p.id === id)
    if (template == null) return
    // Only overwrite content if the user hasn't typed something custom.
    // If they have, ask before clobbering — losing several lines of
    // typing to a misclick is the kind of avoidable papercut that
    // motivated the dirty guard pattern in the first place.
    //
    // Important: don't commit setTemplateId(id) until AFTER the user
    // confirms. Otherwise the dropdown visually shows the rejected
    // template while the textarea still holds the old content — a
    // confusing desync where the dropdown label implies a template is
    // applied that isn't.
    if (content.length > 0) {
      // eslint-disable-next-line no-alert
      const ok = window.confirm('Replace the current content with the template?')
      if (!ok) return
    }
    setTemplateId(id)
    setContent(template.content)
  }, [content])

  const handleSubmit = useCallback(async () => {
    if (errors.length > 0) return
    const trimmedName = name.trim()

    setServerError(null)
    setSubmitting(true)

    const id = generateCustomPersonaId(trimmedName)
    const now = Date.now()
    const stored = {
      id,
      name: trimmedName,
      content,
      createdAt: now,
      updatedAt: now,
    }

    try {
      const api = getAPI()
      if (api == null) {
        setServerError('Persona API not available — running outside Electron?')
        setSubmitting(false)
        return
      }
      // Disk write FIRST. Only on success do we mutate the in-memory
      // store, so a failed write never desyncs the UI from disk.
      // Wrapped in withTimeout so a hung main process doesn't leave
      // the Save button stuck on "Saving…" forever.
      await withTimeout(api.personasSave(stored), 10_000, 'Save timed out')
      // Reset submitting BEFORE onCreated. Currently onCreated unmounts
      // the form, so the order is invisible — but the next three panes
      // will copy this pattern and one of them might keep the form
      // mounted (e.g., "save and create another"). Resetting first
      // means the button is never stuck in the disabled state if the
      // form survives the success callback.
      setSubmitting(false)
      onCreated(toPersona(stored))
    } catch (err) {
      // Surface a friendly message instead of leaking the raw Node.js
      // error string (e.g., "ENOSPC: no space left on device, write ..."
      // when disk is full). The original message is still logged so
      // devs can see it.
      console.error('[personas] save failed:', err)
      const raw = err instanceof Error ? err.message : String(err)
      const friendly = raw.includes('ENOSPC')
        ? 'Could not save: disk is full.'
        : raw.includes('EACCES') || raw.includes('EROFS')
          ? 'Could not save: permission denied or read-only volume.'
          : `Could not save persona. ${raw}`
      setServerError(friendly)
      setSubmitting(false)
    }
  }, [name, content, errors, onCreated])

  const nameError = errorByField.get('name')
  const contentError = errorByField.get('content')

  return (
    <div className="rounded-md border border-edge-focus bg-surface-base/60 p-4">
      <h4 className="text-xs font-semibold text-content-primary">New custom persona</h4>

      {/* Template starter */}
      <div className="mt-3">
        <label
          htmlFor="persona-template"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted"
        >
          Start from a template (optional)
        </label>
        <select
          id="persona-template"
          value={templateId}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
        >
          <option value="">— None (start blank) —</option>
          {BUILT_IN_PERSONAS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Name */}
      <div className="mt-3">
        <label
          htmlFor="persona-name"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted"
        >
          Name ({name.trim().length}/{MAX_PERSONA_NAME_LENGTH})
        </label>
        <input
          id="persona-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_PERSONA_NAME_LENGTH * 2 /* allow some over-typing for trimming */}
          placeholder="Tech Lead"
          className={`w-full rounded-md border bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus ${
            nameError != null ? 'border-error' : 'border-edge-subtle'
          }`}
        />
        {nameError != null && <p className="mt-1 text-[10px] text-error">{nameError}</p>}
      </div>

      {/* Content */}
      <div className="mt-3">
        <label
          htmlFor="persona-content"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted"
        >
          Persona prompt ({content.length.toLocaleString()}/{MAX_PERSONA_CONTENT_LENGTH.toLocaleString()})
        </label>
        <textarea
          id="persona-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          placeholder="# Tech Lead&#10;&#10;You are a thoughtful tech lead who balances pragmatism with technical excellence..."
          className={`w-full resize-y rounded-md border bg-surface-base px-3 py-2 text-xs text-content-primary outline-none focus:border-edge-focus ${
            contentError != null ? 'border-error' : 'border-edge-subtle'
          }`}
        />
        {contentError != null && <p className="mt-1 text-[10px] text-error">{contentError}</p>}
      </div>

      {/* Server error (failed save) */}
      {serverError != null && (
        <p className="mt-3 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-[11px] text-error">
          {serverError}
        </p>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={errors.length > 0 || submitting}
          className="rounded-md bg-accent-blue px-4 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save persona'}
        </button>
      </div>
    </div>
  )
}

function getAPI() {
  if (typeof window === 'undefined') return null
  return (
    (window as { consiliumAPI?: { personasSave: (persona: Record<string, unknown>) => Promise<void> } })
      .consiliumAPI ?? null
  )
}
