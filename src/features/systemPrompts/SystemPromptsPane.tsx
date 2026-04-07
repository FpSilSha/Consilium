import { type ReactNode, useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { useRegisterDirtyGuard } from '@/features/configuration/dirty-guard'
import { withTimeout } from '@/features/configuration/with-timeout'
import { generateCustomLibraryId } from '@/features/personas/persona-validators'
import { BUILT_IN_SYSTEM_PROMPTS } from './built-in-system-prompts'
import type { SystemPromptCategory, SystemPromptEntry, SystemPromptMode } from './types'

/**
 * System Prompts pane — two independent sub-sections in one pane:
 *
 *   1. Advisor system prompt (Layer 1)   — base / custom / off
 *   2. Persona switch prompt              — base / custom / off
 *
 * Each sub-section has:
 *   - Mode selector (three radio-style buttons)
 *   - Custom entry dropdown (active only when mode === 'custom')
 *   - Expandable "view current prompt" showing the resolved content
 *   - A "+ New custom prompt" button that reveals an inline create
 *     form scoped to this sub-section's category
 *   - Delete button on each existing custom entry of this category
 *
 * Saves are disk-first, store-second — mirroring the personas pane.
 *
 * The pane registers a single dirty guard for the whole pane: if any
 * create form is open with typed input, the guard prompts before
 * allowing a pane switch.
 */

type Tab = 'advisor' | 'persona-switch'

interface PromptsAPI {
  systemPromptsSave: (entry: Record<string, unknown>) => Promise<void>
  systemPromptsDelete: (id: string) => Promise<boolean>
}

interface ConfigAPI {
  configLoad: () => Promise<{ values: Record<string, unknown>; descriptions: Record<string, string> }>
  configSave: (config: Record<string, unknown>) => Promise<void>
}

function getPromptsAPI(): PromptsAPI | null {
  if (typeof window === 'undefined') return null
  return (window as { consiliumAPI?: PromptsAPI }).consiliumAPI ?? null
}

function getConfigAPI(): ConfigAPI | null {
  if (typeof window === 'undefined') return null
  return (window as { consiliumAPI?: ConfigAPI }).consiliumAPI ?? null
}

export function SystemPromptsPane(): ReactNode {
  const [tab, setTab] = useState<Tab>('advisor')

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge-subtle px-6 pt-4">
        <h3 className="text-sm font-semibold text-content-primary">System Prompts</h3>
        <p className="mt-1 text-xs text-content-muted">
          Customize the base advisor instructions and the persona-switch handoff prompt. Each can
          be set to base, custom, or off independently.
        </p>
        <div className="mt-3 flex gap-1">
          <TabButton active={tab === 'advisor'} onClick={() => setTab('advisor')}>
            Advisor instructions
          </TabButton>
          <TabButton active={tab === 'persona-switch'} onClick={() => setTab('persona-switch')}>
            Persona switch
          </TabButton>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {tab === 'advisor' ? (
          <CategorySection category="advisor" />
        ) : (
          <CategorySection category="persona-switch" />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Tab button
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
// Category section — rendered once per sub-section
// ─────────────────────────────────────────────────────────────────────────

function CategorySection({ category }: { readonly category: SystemPromptCategory }): ReactNode {
  const config = useStore((s) => s.systemPromptsConfig)
  const setConfig = useStore((s) => s.setSystemPromptsConfig)
  const customs = useStore((s) => s.customSystemPrompts)
  const addCustom = useStore((s) => s.addCustomSystemPrompt)
  const removeCustom = useStore((s) => s.removeCustomSystemPrompt)

  const [showForm, setShowForm] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Narrow the customs array to this category only.
  const filteredCustoms = useMemo(
    () => customs.filter((c) => c.category === category),
    [customs, category],
  )

  // Built-in entry for this category (always exactly one).
  const builtIn = BUILT_IN_SYSTEM_PROMPTS.find((e) => e.category === category)

  // Current mode + customId for this category
  const currentMode: SystemPromptMode =
    category === 'advisor' ? config.advisorMode : config.personaSwitchMode
  const currentCustomId: string | null =
    category === 'advisor' ? config.advisorCustomId : config.personaSwitchCustomId

  // Persist a config change to disk AND store. Disk-first: read current
  // values via configLoad, merge our change, write back, then update
  // store.
  //
  // The store-side merge reads live state via useStore.getState() at
  // call time rather than capturing it via a useCallback closure. This
  // matters because two scenarios can produce a stale closure:
  //
  //   1. Same-category rapid toggles: Base→Custom→Off. Each click
  //      enqueues a persistConfigChange. The first one's setConfig
  //      hasn't resolved into a re-render yet, so the second click's
  //      callback sees the original (now stale) `config` snapshot.
  //
  //   2. Cross-category clobber: user toggles persona-switch mode in
  //      one tab, immediately switches to the advisor tab and toggles
  //      its mode. The advisor tab's callback was memoized with a
  //      `config` snapshot from before the persona-switch update,
  //      and its spread overwrites the persona-switch mode change.
  //
  // Reading from useStore.getState() inside the merge avoids both —
  // the merge always sees the latest store state. The trade-off is
  // that this callback is no longer pure relative to its deps array,
  // but Zustand reads are explicit and stable so this is fine.
  const persistConfigChange = useCallback(
    async (next: { mode: SystemPromptMode; customId: string | null }): Promise<void> => {
      setSaveError(null)
      const configApi = getConfigAPI()
      if (configApi == null) {
        setSaveError('Config API not available')
        return
      }
      try {
        const { values } = await configApi.configLoad()
        const nextValues: Record<string, unknown> = {
          ...values,
          ...(category === 'advisor'
            ? {
                advisorSystemPromptMode: next.mode,
                advisorSystemPromptCustomId: next.customId,
              }
            : {
                personaSwitchPromptMode: next.mode,
                personaSwitchPromptCustomId: next.customId,
              }),
        }
        await configApi.configSave(nextValues)
        // Read LIVE store state at call time, not the closure snapshot.
        // See the comment block above for why.
        const liveConfig = useStore.getState().systemPromptsConfig
        const nextConfig = {
          ...liveConfig,
          ...(category === 'advisor'
            ? { advisorMode: next.mode, advisorCustomId: next.customId }
            : { personaSwitchMode: next.mode, personaSwitchCustomId: next.customId }),
        }
        setConfig(nextConfig)
      } catch (err) {
        console.error('[system-prompts] failed to persist config change:', err)
        setSaveError(err instanceof Error ? err.message : 'Failed to save')
      }
    },
    // `config` no longer in deps — we read from useStore.getState() at
    // call time. Keeping it in the deps would re-create the callback
    // on every config change for no benefit.
    [category, setConfig],
  )

  const handleModeChange = useCallback(
    (next: SystemPromptMode) => {
      // When switching to custom and no customId is selected yet,
      // auto-pick the first available custom (if any). If none exist,
      // the mode flips but the dropdown will show the empty picker.
      let nextCustomId = currentCustomId
      if (next === 'custom' && nextCustomId == null && filteredCustoms.length > 0) {
        nextCustomId = filteredCustoms[0]!.id
      }
      // When switching away from custom, clear the customId to keep
      // config clean. The resolver ignores customId when mode != custom
      // but the clean state survives a round-trip through the raw JSON
      // editor.
      if (next !== 'custom') nextCustomId = null
      void persistConfigChange({ mode: next, customId: nextCustomId })
    },
    [currentCustomId, filteredCustoms, persistConfigChange],
  )

  const handleCustomIdChange = useCallback(
    (id: string) => {
      void persistConfigChange({ mode: 'custom', customId: id })
    },
    [persistConfigChange],
  )

  const handleDeleteCustom = useCallback(
    async (id: string) => {
      const api = getPromptsAPI()
      if (api != null) {
        try {
          await withTimeout(api.systemPromptsDelete(id), 10_000, 'Delete timed out')
        } catch (err) {
          console.error('[system-prompts] failed to delete from disk:', err)
        }
      }
      removeCustom(id)
      // If the deleted entry was the currently selected custom, fall
      // back to base + null. Read LIVE store state for this decision —
      // if a parallel mode change just happened, the closure snapshot
      // (currentCustomId / currentMode) could be stale and lead to a
      // spurious cascade.
      const live = useStore.getState().systemPromptsConfig
      const liveMode = category === 'advisor' ? live.advisorMode : live.personaSwitchMode
      const liveCustomId =
        category === 'advisor' ? live.advisorCustomId : live.personaSwitchCustomId
      if (liveCustomId === id && liveMode === 'custom') {
        void persistConfigChange({ mode: 'base', customId: null })
      }
    },
    [category, removeCustom, persistConfigChange],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Mode selector */}
      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-content-muted">
          Mode
        </p>
        <div className="flex gap-1">
          <ModeButton
            active={currentMode === 'base'}
            onClick={() => handleModeChange('base')}
            label="Base"
            description="Use the built-in prompt"
          />
          <ModeButton
            active={currentMode === 'custom'}
            onClick={() => handleModeChange('custom')}
            label="Custom"
            description="Use a custom prompt you've created"
            disabled={filteredCustoms.length === 0 && currentMode !== 'custom'}
          />
          <ModeButton
            active={currentMode === 'off'}
            onClick={() => handleModeChange('off')}
            label="Off"
            description={
              category === 'advisor'
                ? 'Send no Layer 1 instructions'
                : 'Skip summarization on persona switch'
            }
          />
        </div>
      </div>

      {/* Custom picker (only when mode is custom and at least one exists) */}
      {currentMode === 'custom' && filteredCustoms.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-content-muted">
            Active custom prompt
          </p>
          <select
            value={currentCustomId ?? ''}
            onChange={(e) => handleCustomIdChange(e.target.value)}
            className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
          >
            {filteredCustoms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {saveError != null && (
        <p className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-[11px] text-error">
          {saveError}
        </p>
      )}

      {/* Base entry viewer */}
      {builtIn != null && (
        <ExpandableEntry
          title={builtIn.name}
          badge="base"
          content={builtIn.content}
          readOnly
        />
      )}

      {/* Custom entries for this category */}
      {filteredCustoms.length === 0 && !showForm && (
        <p className="text-xs italic text-content-disabled">
          No custom {category === 'advisor' ? 'advisor' : 'persona-switch'} prompts yet.
        </p>
      )}
      {filteredCustoms.map((entry) => {
        // Show an inline badge on entries with empty content so the
        // user is reminded that selecting them is behaviorally
        // identical to choosing 'off' for this category. Conditionally
        // omit the badge prop entirely (rather than passing undefined)
        // so the exactOptionalPropertyTypes contract is satisfied.
        const badgeProps =
          entry.content.trim() === '' ? { badge: 'empty' as const } : {}
        return (
          <ExpandableEntry
            key={entry.id}
            title={entry.name}
            content={entry.content}
            onDelete={() => handleDeleteCustom(entry.id)}
            {...badgeProps}
          />
        )
      })}

      {showForm ? (
        <CreateForm
          category={category}
          onCancel={() => setShowForm(false)}
          onCreated={(entry) => {
            addCustom(entry)
            setShowForm(false)
            // Auto-select the new entry only when the user is already
            // in 'custom' mode with no selection yet. Auto-switching
            // from 'base' or 'off' to 'custom' would silently change
            // the active behavior in ways the user did not request —
            // someone who deliberately chose 'off' shouldn't have
            // their advisor instructions silently re-enabled by
            // creating a custom for future use.
            if (currentMode === 'custom' && currentCustomId == null) {
              void persistConfigChange({ mode: 'custom', customId: entry.id })
            }
          }}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="self-start rounded-md border border-dashed border-edge-subtle px-3 py-1.5 text-xs text-content-muted transition-colors hover:border-edge-focus hover:text-content-primary"
        >
          + New custom {category === 'advisor' ? 'advisor prompt' : 'persona-switch prompt'}
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Mode button — three-way selector atom
// ─────────────────────────────────────────────────────────────────────────

function ModeButton({
  active,
  onClick,
  label,
  description,
  disabled = false,
}: {
  readonly active: boolean
  readonly onClick: () => void
  readonly label: string
  readonly description: string
  readonly disabled?: boolean
}): ReactNode {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={description}
      className={`flex-1 rounded-md border px-3 py-2 text-left text-xs transition-colors disabled:opacity-50 ${
        active
          ? 'border-accent-blue bg-accent-blue/10 text-content-primary'
          : 'border-edge-subtle bg-surface-base text-content-muted hover:border-edge-focus hover:text-content-primary'
      }`}
    >
      <div className="font-medium">{label}</div>
      <div className="mt-0.5 text-[10px] text-content-disabled">{description}</div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Expandable entry row — shows name + badge, click to see full content
// ─────────────────────────────────────────────────────────────────────────

function ExpandableEntry({
  title,
  badge,
  content,
  readOnly = false,
  onDelete,
}: {
  readonly title: string
  readonly badge?: string
  readonly content: string
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
          <span className="truncate text-xs font-medium text-content-primary">{title}</span>
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
// CreateForm — inline create form for new custom entries
// ─────────────────────────────────────────────────────────────────────────

const MAX_NAME_LENGTH = 60
const MAX_CONTENT_LENGTH = 16_000

function CreateForm({
  category,
  onCancel,
  onCreated,
}: {
  readonly category: SystemPromptCategory
  readonly onCancel: () => void
  readonly onCreated: (entry: SystemPromptEntry) => void
}): ReactNode {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [templateId, setTemplateId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  // Starter templates: all customs of the SAME category (lets the user
  // branch an existing custom) + the built-in for this category.
  const customs = useStore((s) => s.customSystemPrompts)
  const categoryTemplates = useMemo(() => {
    const customOfCategory = customs.filter((c) => c.category === category)
    const builtIn = BUILT_IN_SYSTEM_PROMPTS.filter((e) => e.category === category)
    return [...builtIn, ...customOfCategory]
  }, [customs, category])

  // Name validation: non-empty after trim, under MAX_NAME_LENGTH.
  const trimmedName = name.trim()
  const nameError =
    trimmedName.length === 0
      ? 'Name is required.'
      : trimmedName.length > MAX_NAME_LENGTH
        ? `Name must be ${MAX_NAME_LENGTH} characters or fewer.`
        : null
  const contentError =
    content.length > MAX_CONTENT_LENGTH
      ? `Content must be ${MAX_CONTENT_LENGTH.toLocaleString()} characters or fewer.`
      : null
  const hasErrors = nameError != null || contentError != null

  // Dirty guard: warn on pane switch if the form has any typed input.
  const isDirty = name.length > 0 || content.length > 0
  const registerDirtyGuard = useRegisterDirtyGuard()
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  useEffect(() => {
    registerDirtyGuard(() => {
      if (!isDirtyRef.current) return true
      // eslint-disable-next-line no-alert
      return window.confirm('Discard unsaved system prompt?')
    })
    return () => registerDirtyGuard(null)
  }, [registerDirtyGuard])

  const handleTemplateChange = useCallback(
    (id: string) => {
      if (id === '') {
        setTemplateId('')
        return
      }
      const template = categoryTemplates.find((t) => t.id === id)
      if (template == null) return
      if (content.length > 0) {
        // eslint-disable-next-line no-alert
        const ok = window.confirm('Replace the current content with the template?')
        if (!ok) return
      }
      setTemplateId(id)
      setContent(template.content)
    },
    [content, categoryTemplates],
  )

  const handleSubmit = useCallback(async () => {
    if (hasErrors) return
    setServerError(null)
    setSubmitting(true)

    // System prompt IDs use the dedicated kind='sysprompt' generator so
    // they live in a disjoint namespace from personas (whose IDs use
    // the legacy custom_{slug}_{suffix} format).
    const id = generateCustomLibraryId('sysprompt', trimmedName)
    const now = Date.now()
    const stored = {
      id,
      category,
      name: trimmedName,
      content,
      createdAt: now,
      updatedAt: now,
    }

    const api = getPromptsAPI()
    if (api == null) {
      setServerError('System prompt API not available')
      setSubmitting(false)
      return
    }
    try {
      await withTimeout(api.systemPromptsSave(stored), 10_000, 'Save timed out')
      setSubmitting(false)
      const entry: SystemPromptEntry = {
        id,
        category,
        name: trimmedName,
        content,
        isBuiltIn: false,
      }
      onCreated(entry)
    } catch (err) {
      console.error('[system-prompts] save failed:', err)
      const raw = err instanceof Error ? err.message : String(err)
      const friendly = raw.includes('ENOSPC')
        ? 'Could not save: disk is full.'
        : raw.includes('EACCES') || raw.includes('EROFS')
          ? 'Could not save: permission denied or read-only volume.'
          : `Could not save prompt. ${raw}`
      setServerError(friendly)
      setSubmitting(false)
    }
  }, [hasErrors, trimmedName, content, category, onCreated])

  return (
    <div className="rounded-md border border-edge-focus bg-surface-base/60 p-4">
      <h4 className="text-xs font-semibold text-content-primary">
        New custom {category === 'advisor' ? 'advisor prompt' : 'persona-switch prompt'}
      </h4>

      <div className="mt-3">
        <label
          htmlFor="sysprompt-template"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted"
        >
          Start from a template (optional)
        </label>
        <select
          id="sysprompt-template"
          value={templateId}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
        >
          <option value="">— None (start blank) —</option>
          {categoryTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.isBuiltIn ? ' (base)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        <label
          htmlFor="sysprompt-name"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted"
        >
          Name ({trimmedName.length}/{MAX_NAME_LENGTH})
        </label>
        <input
          id="sysprompt-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            category === 'advisor'
              ? 'Terse Advisor Instructions'
              : 'Detailed Handoff Summarizer'
          }
          className={`w-full rounded-md border bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus ${
            nameError != null ? 'border-error' : 'border-edge-subtle'
          }`}
        />
        {nameError != null && <p className="mt-1 text-[10px] text-error">{nameError}</p>}
      </div>

      <div className="mt-3">
        <label
          htmlFor="sysprompt-content"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-content-muted"
        >
          Prompt content ({content.length.toLocaleString()}/{MAX_CONTENT_LENGTH.toLocaleString()})
          {category === 'persona-switch' && (
            <span className="ml-2 normal-case text-content-disabled">
              · placeholders: {'{oldLabel}'}, {'{newLabel}'}, {'{messages}'}
            </span>
          )}
        </label>
        <textarea
          id="sysprompt-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          placeholder={
            category === 'advisor'
              ? 'You are one of several AI advisors...'
              : 'Summarize the conversation. Old advisor: {oldLabel}, new: {newLabel}\n\n{messages}'
          }
          className={`w-full resize-y rounded-md border bg-surface-base px-3 py-2 text-xs text-content-primary outline-none focus:border-edge-focus ${
            contentError != null ? 'border-error' : 'border-edge-subtle'
          }`}
        />
        {contentError != null && <p className="mt-1 text-[10px] text-error">{contentError}</p>}
        {contentError == null && content.trim() === '' && (
          <p className="mt-1 text-[10px] italic text-content-disabled">
            Empty content is allowed, but selecting this entry will behave identically to choosing
            "Off" — no {category === 'advisor' ? 'advisor instructions' : 'summarization'} will be
            sent.
          </p>
        )}
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
