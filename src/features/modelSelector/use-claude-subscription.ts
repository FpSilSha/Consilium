import { useEffect, useState } from 'react'
import type { LocalAgentReadiness } from '../../../shared/local-agent/protocol'
import { getClaudeSubscriptionReadiness } from '@/services/api/local-agent'
/** Whether the user's own Claude Code install can run subscription advisors. */
export type SubscriptionAvailability = 'checking' | 'available' | 'unavailable'

type Known = Exclude<SubscriptionAvailability, 'checking'>

/**
 * Each check starts `claude --version` and `claude auth status`, so a result
 * is shared by every screen and reused for a minute. Screens re-check when the
 * window regains focus (e.g. after signing in to Claude Code in a terminal),
 * and the advisor editor's own status check updates everyone.
 */
const CACHE_MS = 60_000
/** An "unavailable" result is re-checked on focus once it is this old, even within the cache window. */
const RECHECK_UNAVAILABLE_MS = 5_000

let cached: { readonly at: number; readonly value: Known } | null = null
let inFlight: Promise<Known> | null = null
/** Checks are numbered as they start; a result only counts if no later-started check has reported. */
let lastTicket = 0
let publishedTicket = 0
const listeners = new Set<(value: Known) => void>()

/** Call when a check starts; pass the ticket back with its result. */
export function beginClaudeSubscriptionCheck(): number {
  lastTicket += 1
  return lastTicket
}

function publish(value: Known, ticket: number): boolean {
  if (ticket < publishedTicket) return false
  publishedTicket = ticket
  cached = { at: Date.now(), value }
  for (const listener of listeners) listener(value)
  return true
}

function freshCached(now: number): Known | null {
  return cached !== null && now - cached.at < CACHE_MS ? cached.value : null
}

export function loadClaudeSubscriptionAvailability(now: number = Date.now(), force = false): Promise<Known> {
  const fresh = force ? null : freshCached(now)
  if (fresh !== null) return Promise.resolve(fresh)
  if (inFlight !== null) return inFlight
  const ticket = beginClaudeSubscriptionCheck()
  const check: Promise<Known> = getClaudeSubscriptionReadiness()
    .then((readiness) => (readiness.state === 'ready' ? 'available' as const : 'unavailable' as const))
    .catch(() => 'unavailable' as const)
    .then((value) => {
      if (inFlight === check) inFlight = null
      // A check that started later has already reported; keep its result.
      if (!publish(value, ticket) && cached !== null) return cached.value
      return value
    })
  inFlight = check
  return check
}

/** Focus handler: normal cached load, but an "unavailable" result is re-checked promptly. */
export function refreshClaudeSubscriptionAvailability(now: number = Date.now()): Promise<Known> {
  const staleUnavailable = cached !== null && cached.value === 'unavailable' && now - cached.at >= RECHECK_UNAVAILABLE_MS
  return loadClaudeSubscriptionAvailability(now, staleUnavailable)
}

/** Shares a readiness result checked elsewhere (the advisor editor's status line). */
export function recordClaudeSubscriptionReadiness(
  readiness: LocalAgentReadiness,
  ticket: number = beginClaudeSubscriptionCheck(),
): void {
  publish(readiness.state === 'ready' ? 'available' : 'unavailable', ticket)
}

/** For tests. */
export function resetClaudeSubscriptionAvailabilityCache(): void {
  cached = null
  inFlight = null
  lastTicket = 0
  publishedTicket = 0
  listeners.clear()
}

/** Whether Claude Code is installed and signed in with a subscription ('checking' until known). */
export function useClaudeSubscriptionAvailability(): SubscriptionAvailability {
  const [value, setValue] = useState<SubscriptionAvailability>(() => freshCached(Date.now()) ?? 'checking')

  useEffect(() => {
    listeners.add(setValue)
    // A result published between render and subscribing would otherwise be missed.
    const current = freshCached(Date.now())
    if (current !== null) setValue(current)
    void loadClaudeSubscriptionAvailability()
    const onFocus = (): void => { void refreshClaudeSubscriptionAvailability() }
    window.addEventListener('focus', onFocus)
    return () => {
      listeners.delete(setValue)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return value
}
