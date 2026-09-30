import type { LocalAgentReadiness } from '../../../shared/local-agent/protocol'

const PLAN_PATTERN = /^[a-z0-9_-]{1,32}$/
const EMAIL_PATTERN = /^[^\s@]{1,128}@[^\s@]{1,253}$/

/**
 * Maps `claude auth status --json` output to readiness. Only `loggedIn`,
 * `authMethod`, `apiProvider` and `subscriptionType` are read; readiness
 * never carries identity fields (email, org), and they are never logged.
 *
 * Subscription mode fails closed: anything other than a first-party
 * claude.ai login is not ready, so usage can never silently move to API
 * billing.
 */
export function readinessFromAuthStatus(stdout: string, runtimeVersion: string): LocalAgentReadiness {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { state: 'error', message: 'Could not read Claude Code sign-in status' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { state: 'error', message: 'Could not read Claude Code sign-in status' }
  }
  const status = parsed as Record<string, unknown>
  const loggedIn = status['loggedIn']
  if (typeof loggedIn !== 'boolean') {
    return { state: 'error', message: 'Could not read Claude Code sign-in status' }
  }
  if (!loggedIn) return { state: 'signed-out' }

  const apiProvider = status['apiProvider']
  if (apiProvider !== undefined && apiProvider !== 'firstParty') {
    return { state: 'wrong-auth', detail: 'Claude Code is configured for a third-party provider, not a Claude subscription' }
  }
  if (status['authMethod'] !== 'claude.ai') {
    return { state: 'wrong-auth', detail: 'Claude Code is signed in with an API key or another method, not a Claude subscription' }
  }

  const plan = status['subscriptionType']
  return typeof plan === 'string' && PLAN_PATTERN.test(plan)
    ? { state: 'ready', runtimeVersion, plan }
    : { state: 'ready', runtimeVersion }
}

/**
 * The signed-in account's email, used only to redact it from advisor output
 * for the current turn (Claude Code injects it into every prompt). Never
 * stored, logged, returned over IPC, or included in readiness.
 */
export function accountEmailFromAuthStatus(stdout: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(stdout)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const email = (parsed as Record<string, unknown>)['email']
    return typeof email === 'string' && EMAIL_PATTERN.test(email) ? email : undefined
  } catch {
    return undefined
  }
}

export interface TurnReadiness {
  /** Safe to show and send over IPC; never carries identity. */
  readonly readiness: LocalAgentReadiness
  /** Main-process only, for redaction during one turn. */
  readonly accountEmail?: string | undefined
}

/** Shorter than this, the email can't be redacted reliably. */
const MIN_REDACTABLE_EMAIL = 6

/**
 * Readiness for a turn. A signed-in subscription whose account email can't be
 * read (or is too short to redact) is reported as an error: advisors would see
 * the email in their context and it could not be kept out of the transcript.
 */
export function turnReadinessFromAuthStatus(stdout: string, runtimeVersion: string): TurnReadiness {
  const readiness = readinessFromAuthStatus(stdout, runtimeVersion)
  if (readiness.state !== 'ready') return { readiness }
  const accountEmail = accountEmailFromAuthStatus(stdout)
  if (accountEmail === undefined || accountEmail.length < MIN_REDACTABLE_EMAIL) {
    return {
      readiness: {
        state: 'error',
        message: 'Could not read the signed-in Claude account, so subscription turns are blocked to keep account details out of the conversation. Run `claude auth status` to check your sign-in.',
      },
    }
  }
  return { readiness, accountEmail }
}
