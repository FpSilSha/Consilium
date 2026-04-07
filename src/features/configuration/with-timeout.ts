/**
 * Wraps an IPC promise with a timeout. Guards against a hung main
 * process leaving a save/delete button permanently disabled while the
 * pane waits forever for a response that never comes.
 *
 * Used by every native pane in ConfigurationModal that performs IPC
 * — the 4 library panes (Personas, System Prompts, Compile Prompts,
 * Compact Prompts) and the 3 settings panes (Compile, Auto-compaction,
 * Advanced). Originally duplicated in each settings pane file with a
 * "if a third caller appears, hoist it" comment; the threshold was
 * passed when the library panes also needed it, and the helper was
 * promoted to this shared module.
 *
 * Behavior:
 *   - On success within the timeout: resolves with the original value.
 *   - On rejection within the timeout: rejects with the original error
 *     (re-wrapped in an Error if a non-Error was thrown).
 *   - On timeout: rejects with a new Error using the supplied label.
 *     The original promise continues running in the background but
 *     its eventual result is ignored — there's no abort mechanism for
 *     the IPC call itself, so we accept the orphan.
 *
 * 10 seconds is the recommended timeout for config IPC calls. Longer
 * than that almost always means the main process is hung, not slow.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      },
    )
  })
}
