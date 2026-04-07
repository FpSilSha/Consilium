/**
 * Module-scoped registry for the in-flight compile stream's AbortController.
 *
 * Compile is fully isolated from the advisor turn cycle, so it does NOT live
 * in `activeControllers` (which `stopAll()` in turn-dispatcher manages for
 * advisor streams). But session switching still needs a way to abort the
 * compile so its onDone callback doesn't fire against the wrong session.
 *
 * Convention:
 * - At most one compile is active at a time.
 * - Calling `registerActiveCompile` when one is already active aborts the
 *   prior one — the most recent click wins.
 * - `loadSession()` and `initializeNewSession()` (when used to clear) call
 *   `abortActiveCompile()` to ensure no stale callback lands in the new
 *   session.
 * - Streams that complete normally clear the registry via the same call.
 */

let activeController: AbortController | null = null

export function registerActiveCompile(controller: AbortController): void {
  // If a compile is already running, abort it — the new one supersedes.
  if (activeController !== null && activeController !== controller) {
    activeController.abort()
  }
  activeController = controller
}

export function abortActiveCompile(): void {
  if (activeController !== null) {
    activeController.abort()
    activeController = null
  }
}

export function clearActiveCompile(controller: AbortController): void {
  // Only clear if the registered controller matches — guards against
  // a late-arriving clear from a superseded compile that already aborted.
  if (activeController === controller) {
    activeController = null
  }
}
