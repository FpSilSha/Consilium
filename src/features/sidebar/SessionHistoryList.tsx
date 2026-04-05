import { type ReactNode, useEffect, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { Tooltip } from '@/features/ui/Tooltip'
import { listSessions, loadSession, deleteSession, renameSession } from '@/features/sessions/session-manager'
import type { SessionMetadata } from '@/features/sessions/session-types'

export function SessionHistoryList(): ReactNode {
  const [sessions, setSessions] = useState<readonly SessionMetadata[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const currentSessionId = useStore((s) => s.currentSessionId)
  const messageCount = useStore((s) => s.messages.length)

  // Refresh session list on mount, message changes, and session switches/creation
  useEffect(() => {
    let cancelled = false
    const load = () => {
      listSessions()
        .then((result) => { if (!cancelled) setSessions(result) })
        .catch(() => {})
    }
    load()

    // Refresh after auto-save debounce (3s after message change)
    const timer = setTimeout(load, 3000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [messageCount, currentSessionId])

  const handleSelect = useCallback(async (id: string) => {
    if (id === currentSessionId) return
    await loadSession(id)
  }, [currentSessionId])

  const handleRename = useCallback(async (id: string) => {
    const trimmed = editName.trim()
    if (trimmed === '') { setEditingId(null); return }
    await renameSession(id, trimmed)
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, name: trimmed } : s))
    setEditingId(null)
  }, [editName])

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
    // If we deleted the current session, clear the ID
    if (id === currentSessionId) {
      useStore.getState().setCurrentSessionId(null)
    }
  }, [currentSessionId])

  if (sessions.length === 0) {
    return (
      <div className="px-3 py-4">
        <p className="text-xs text-content-disabled">No sessions yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5 px-2">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`group flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 transition-colors hover:bg-surface-hover ${
            session.id === currentSessionId ? 'bg-surface-selected' : ''
          }`}
          onClick={() => handleSelect(session.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSelect(session.id) }}
        >
          <div className="min-w-0 flex-1">
            {editingId === session.id ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => handleRename(session.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(session.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded border border-edge-focus bg-surface-base px-1 py-0.5 text-xs text-content-primary outline-none"
                autoFocus
              />
            ) : (
              <Tooltip text="Double-click to rename" position="right">
                <div
                  className="truncate text-xs text-content-primary"
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                  setEditingId(session.id)
                  setEditName(session.name)
                }}
              >
                {session.name}
                </div>
              </Tooltip>
            )}
            <div className="text-[10px] text-content-disabled">
              {formatRelativeTime(session.updatedAt)}
            </div>
          </div>
          <Tooltip text="Delete session" position="left">
            <button
              onClick={(e) => handleDelete(session.id, e)}
              className="shrink-0 text-[10px] text-content-disabled opacity-0 transition-opacity hover:text-accent-red group-hover:opacity-100"
            >
              ✕
            </button>
          </Tooltip>
        </div>
      ))}
    </div>
  )
}

function formatRelativeTime(timestamp: number): string {
  if (timestamp === 0) return ''
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
