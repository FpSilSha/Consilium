import { redactKeys } from '@/features/keys/key-detection'

/**
 * Redacts API keys from any value before logging.
 * Use this instead of console.error/warn when the input may contain key material.
 */
export function safeLog(level: 'error' | 'warn' | 'log', ...args: unknown[]): void {
  const redacted = args.map((arg) => {
    if (typeof arg === 'string') return redactKeys(arg)
    if (arg instanceof Error) {
      const redactedMessage = redactKeys(arg.message)
      const redactedStack = arg.stack != null ? redactKeys(arg.stack) : undefined
      return { name: arg.name, message: redactedMessage, stack: redactedStack }
    }
    // Best-effort redaction for plain objects that may contain key material
    if (typeof arg === 'object' && arg !== null) {
      try {
        const serialized = JSON.stringify(arg)
        const redacted = redactKeys(serialized)
        if (redacted !== serialized) {
          return JSON.parse(redacted) as unknown
        }
      } catch {
        // Non-serializable (circular ref, BigInt, etc.) — pass through
      }
    }
    return arg
  })

  // eslint-disable-next-line no-console
  console[level](...redacted)
}
