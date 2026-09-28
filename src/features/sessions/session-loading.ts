/** Only suppress saves during the synchronous restore transaction. */
let loading = false

export function isSessionLoading(): boolean {
  return loading
}

export function duringSessionRestore(restore: () => void): void {
  const previous = loading
  loading = true
  try {
    restore()
  } finally {
    loading = previous
  }
}
