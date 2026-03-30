import { type ReactNode, useEffect, useState } from 'react'
import { listSessions } from '@/features/sessions/session-manager'

export function SessionHistoryList(): ReactNode {
  const [sessions, setSessions] = useState<readonly string[]>([])

  useEffect(() => {
    let cancelled = false
    listSessions()
      .then((result) => {
        if (!cancelled) setSessions(result)
      })
      .catch(() => {
        /* non-fatal — show empty state */
      })
    return () => { cancelled = true }
  }, [])

  if (sessions.length === 0) {
    return (
      <div className="px-3 py-4">
        <p className="text-xs text-content-disabled">No sessions yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 px-2">
      {sessions.map((sessionId) => (
        <div
          key={sessionId}
          className="rounded-md px-3 py-2 text-xs text-content-muted"
          aria-label={`Session ${sessionId}`}
        >
          {sessionId}
        </div>
      ))}
    </div>
  )
}
