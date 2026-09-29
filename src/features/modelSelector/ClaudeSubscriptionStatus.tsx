import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { LocalAgentReadiness } from '../../../shared/local-agent/protocol'
import { getClaudeSubscriptionReadiness } from '@/services/api/local-agent'

function describeReadiness(readiness: LocalAgentReadiness): { readonly ok: boolean; readonly text: string } {
  switch (readiness.state) {
    case 'ready':
      return { ok: true, text: `Claude Code ${readiness.runtimeVersion} is signed in${readiness.plan !== undefined ? ` (${readiness.plan} plan)` : ''}.` }
    case 'not-installed':
      return {
        ok: false,
        text: 'Claude Code is not installed. Install it with Anthropic\'s native installer (on Windows, the npm version is not supported), then run `claude` and sign in.',
      }
    case 'signed-out':
      return { ok: false, text: 'Claude Code is signed out. Run `claude` in a terminal and sign in with your Claude account.' }
    case 'wrong-auth':
      return { ok: false, text: `${readiness.detail}. Subscription advisors never fall back to API billing.` }
    case 'error':
      return { ok: false, text: readiness.message }
  }
}

/** Shows whether the user's own Claude Code install can run a subscription advisor. */
export function ClaudeSubscriptionStatus(): ReactNode {
  const [readiness, setReadiness] = useState<LocalAgentReadiness | null>(null)
  // Only the latest check may update the display; a slow earlier one must not overwrite it.
  const latestCheck = useRef(0)

  const check = useCallback(() => {
    const id = ++latestCheck.current
    setReadiness(null)
    void getClaudeSubscriptionReadiness().then((result) => {
      if (latestCheck.current === id) setReadiness(result)
    })
  }, [])

  useEffect(() => {
    check()
    return () => { latestCheck.current++ }
  }, [check])

  if (readiness === null) {
    return <p className="mb-2 text-[10px] text-content-disabled">Checking Claude Code…</p>
  }

  const { ok, text } = describeReadiness(readiness)
  return (
    <div className="mb-2 flex items-start gap-2 text-[10px]">
      <span className={ok ? 'text-accent-green' : 'text-accent-red'}>{ok ? '●' : '○'}</span>
      <span className="flex-1 text-content-muted">{text}</span>
      {!ok && (
        <button
          onClick={() => { check() }}
          className="shrink-0 text-content-disabled transition-colors hover:text-accent-blue"
        >
          Recheck
        </button>
      )}
    </div>
  )
}
