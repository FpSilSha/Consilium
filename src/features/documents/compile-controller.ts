/**
 * Module-scoped registry for the in-flight compile stream's AbortController.
 *
 * Compile is fully isolated from the advisor turn cycle, so it does NOT live
 * in `activeControllers` (which `turn-dispatcher.stopAll()` manages for
 * advisor streams). But callers that want to "stop everything" still need a
 * single entry point — `stopAll()` calls `abortActiveCompile()` internally
 * so any code path that already calls `stopAll()` (loadSession, the New
 * Consilium handlers, the budget-exceeded paths) automatically aborts the
 * compile too.
 *
 * Convention:
 * - At most one compile is active at a time.
 * - Calling `registerActiveCompile` when one is already active aborts the
 *   prior one — the most recent click wins.
 * - Streams that complete normally clear the registry via `clearActiveCompile`.
 * - This module has zero imports, so importing it from `turn-dispatcher` or
 *   anywhere else creates no dependency cycle.
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
