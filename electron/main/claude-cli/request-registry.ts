export interface RequestOwner {
  readonly webContentsId: number
  readonly sessionId: string
  readonly generation: number
}

interface Entry {
  readonly owner: RequestOwner
  readonly cancel: () => void
}

export interface RequestRegistry {
  /** Returns false if the ID is already in use. */
  register(requestId: string, owner: RequestOwner, cancel: () => void): boolean
  ownerOf(requestId: string): RequestOwner | undefined
  /** Cancels only if `senderId` is the webContents that started the request. */
  cancel(requestId: string, senderId: number): boolean
  finish(requestId: string): void
  cancelAllFor(webContentsId: number): void
  cancelAll(): void
}

/**
 * Tracks in-flight local-agent requests in the main process. A request ID is
 * not a capability: only the webContents that started a request may observe
 * or cancel it.
 */
export function createRequestRegistry(): RequestRegistry {
  const entries = new Map<string, Entry>()

  return {
    register(requestId, owner, cancel) {
      if (entries.has(requestId)) return false
      entries.set(requestId, {
        owner: Object.freeze({ webContentsId: owner.webContentsId, sessionId: owner.sessionId, generation: owner.generation }),
        cancel,
      })
      return true
    },

    ownerOf(requestId) {
      return entries.get(requestId)?.owner
    },

    cancel(requestId, senderId) {
      const entry = entries.get(requestId)
      if (entry === undefined || entry.owner.webContentsId !== senderId) return false
      entry.cancel()
      return true
    },

    finish(requestId) {
      entries.delete(requestId)
    },

    cancelAllFor(webContentsId) {
      for (const entry of [...entries.values()]) {
        if (entry.owner.webContentsId === webContentsId) entry.cancel()
      }
    },

    cancelAll() {
      for (const entry of [...entries.values()]) entry.cancel()
    },
  }
}
