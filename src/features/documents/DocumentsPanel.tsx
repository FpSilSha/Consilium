import { type ReactNode, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { Tooltip } from '@/features/ui/Tooltip'
import { createUserMessage } from '@/services/context-bus/message-factory'
import type { SessionDocument } from './types'
import { DocumentViewerModal } from './DocumentViewerModal'

/**
 * Collapsible "Documents" section in the right sidebar. Hidden when there
 * are no documents and no in-flight compile (so empty state is invisible),
 * shown as a header + list otherwise.
 *
 * Each document row exposes:
 *   - View → opens a full modal with the rendered markdown
 *   - Add to chat → injects the doc as a USER message in the thread
 *   - Export .md → saves the doc to disk via existing file dialog IPC
 *   - Remove → unlinks from this session (file untouched)
 *   - Delete → unlinks AND deletes the file from disk (with confirmation)
 *
 * The "drafting" state of an in-flight compile is rendered as a pinned
 * row at the top, streaming the partial content live.
 */
export function DocumentsPanel(): ReactNode {
  const documents = useStore((s) => s.documents)
  const draftCompile = useStore((s) => s.draftCompile)
  const documentsPanelOpen = useStore((s) => s.documentsPanelOpen)
  const setDocumentsPanelOpen = useStore((s) => s.setDocumentsPanelOpen)

  const [viewing, setViewing] = useState<SessionDocument | null>(null)

  const hasContent = documents.length > 0 || draftCompile != null
  if (!hasContent) return null

  return (
    <>
      <div className="shrink-0 border-b border-edge-subtle">
        <button
          onClick={() => setDocumentsPanelOpen(!documentsPanelOpen)}
          className="flex w-full items-center justify-between px-3 pt-3 pb-1 text-left transition-colors hover:bg-surface-hover"
        >
          <h2 className="text-xs font-medium uppercase tracking-wider text-content-muted">
            Documents ({documents.length}{draftCompile != null ? ' + drafting' : ''})
          </h2>
          <span className="text-[10px] text-content-disabled">
            {documentsPanelOpen ? '▾' : '▸'}
          </span>
        </button>

        {documentsPanelOpen && (
          <div className="max-h-64 overflow-y-auto px-1 pb-2">
            {/* Live drafting row */}
            {draftCompile != null && <DraftingRow />}

            {/* Saved documents */}
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onView={() => setViewing(doc)}
              />
            ))}
          </div>
        )}
      </div>

      {viewing != null && (
        <DocumentViewerModal
          document={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Drafting row — rendered while a compile is streaming
// ─────────────────────────────────────────────────────────────────────────

function DraftingRow(): ReactNode {
  const draft = useStore((s) => s.draftCompile)
  if (draft == null) return null

  if (draft.status === 'error') {
    return (
      <div className="mx-1 my-1 rounded-md border border-error/30 bg-error/10 px-2 py-2">
        <p className="text-[11px] font-medium text-error">{draft.title}</p>
        <p className="mt-0.5 text-[10px] text-content-muted">{draft.error}</p>
      </div>
    )
  }

  return (
    <div className="mx-1 my-1 rounded-md border border-accent-blue/30 bg-accent-blue/5 px-2 py-2">
      <div className="flex items-center gap-2">
        <svg className="h-3 w-3 animate-spin text-accent-blue" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <span className="text-[11px] font-medium text-accent-blue">Compiling…</span>
        <span className="ml-auto text-[10px] text-content-disabled">{draft.modelName}</span>
      </div>
      <p className="mt-1 text-[10px] text-content-muted">
        {draft.content.length === 0
          ? 'Waiting for first token…'
          : `${draft.content.length.toLocaleString()} chars so far`}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Saved document row
// ─────────────────────────────────────────────────────────────────────────

function DocumentRow({ doc, onView }: {
  readonly doc: SessionDocument
  readonly onView: () => void
}): ReactNode {
  const removeDocumentFromSession = useStore((s) => s.removeDocumentFromSession)
  const appendMessage = useStore((s) => s.appendMessage)

  const [showActions, setShowActions] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleAddToChat = useCallback(() => {
    // Per design: docs added to chat are attributed to the USER, not a persona.
    // The user is "saying" here is a document — use the user role with the
    // doc content. windowId is empty because user messages aren't tied to an
    // advisor window.
    const message = createUserMessage(doc.content, '')
    appendMessage(message)
    setShowActions(false)
  }, [doc, appendMessage])

  const handleExport = useCallback(async () => {
    const api = (window as { consiliumAPI?: { saveFileDialog: (name: string, content: string) => Promise<boolean> } }).consiliumAPI
    if (api == null) return
    const filename = `${doc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}.md`
    await api.saveFileDialog(filename || 'document.md', doc.content)
    setShowActions(false)
  }, [doc])

  const handleRemove = useCallback(() => {
    removeDocumentFromSession(doc.id)
    setShowActions(false)
  }, [doc.id, removeDocumentFromSession])

  const handleDeleteForever = useCallback(async () => {
    // Same store mutation as Remove from Session — the only difference is
    // that this path also fires the documents:delete IPC to remove the
    // file from disk.
    removeDocumentFromSession(doc.id)
    const api = (window as { consiliumAPI?: { documentsDelete: (id: string) => Promise<boolean> } }).consiliumAPI
    if (api != null) {
      try {
        await api.documentsDelete(doc.id)
      } catch {
        // Non-fatal — store state already updated
      }
    }
    setConfirmDelete(false)
    setShowActions(false)
  }, [doc.id, removeDocumentFromSession])

  return (
    <div className="group mx-1 my-0.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover">
      <div className="flex items-center gap-2">
        <button
          onClick={onView}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate text-xs font-medium text-content-primary">
            {doc.title}
          </div>
          <div className="truncate text-[10px] text-content-disabled">
            {doc.modelName}
            {doc.cost > 0 && <span> · ~${doc.cost.toFixed(4)}</span>}
            {doc.focusPrompt != null && <span> · focused</span>}
          </div>
        </button>

        <button
          onClick={() => setShowActions(!showActions)}
          className="shrink-0 rounded p-0.5 text-content-disabled opacity-0 transition-opacity hover:text-content-primary group-hover:opacity-100 focus:opacity-100"
          aria-label="Document actions"
        >
          ⋯
        </button>
      </div>

      {showActions && (
        <div className="mt-1 flex flex-wrap gap-1 border-t border-edge-subtle pt-1">
          <Tooltip text="Insert as a user message in the chat" position="top">
            <button
              onClick={handleAddToChat}
              className="rounded bg-surface-base px-2 py-0.5 text-[10px] text-content-muted hover:bg-surface-active hover:text-content-primary"
            >
              Add to chat
            </button>
          </Tooltip>
          <button
            onClick={handleExport}
            className="rounded bg-surface-base px-2 py-0.5 text-[10px] text-content-muted hover:bg-surface-active hover:text-content-primary"
          >
            Export .md
          </button>
          <Tooltip text="Unlink from this session — file kept on disk" position="top">
            <button
              onClick={handleRemove}
              className="rounded bg-surface-base px-2 py-0.5 text-[10px] text-content-muted hover:bg-surface-active hover:text-content-primary"
            >
              Remove
            </button>
          </Tooltip>
          {!confirmDelete ? (
            <Tooltip text="Delete the file from disk — affects all sessions referencing it" position="top">
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded bg-surface-base px-2 py-0.5 text-[10px] text-error hover:bg-error/10"
              >
                Delete forever
              </button>
            </Tooltip>
          ) : (
            <>
              <button
                onClick={handleDeleteForever}
                className="rounded bg-error px-2 py-0.5 text-[10px] font-medium text-content-inverse hover:bg-error/90"
              >
                Confirm delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded bg-surface-base px-2 py-0.5 text-[10px] text-content-muted hover:bg-surface-active"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
