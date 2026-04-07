import { type ReactNode } from 'react'
import { useStore } from '@/store'

/**
 * Banner shown at the top of the app when Electron's safeStorage
 * encryption is unavailable on the current OS. Triggered by the
 * startup key loader (loadPersistedKeys) calling
 * keysAvailable() over IPC.
 *
 * Common case: a Linux user without gnome-keyring / libsecret /
 * kwallet installed. Less common: an Electron version mismatch on
 * macOS or Windows. The main-process key store refuses to write
 * keys when encryption is unavailable, so the user is never at
 * risk of plaintext-on-disk — they just can't save keys at all
 * until they fix their secret service.
 *
 * The banner stays visible until the user fixes the underlying
 * issue and relaunches. There's no dismiss action because the
 * problem is functional (you literally cannot save keys, so the
 * app can't really be used) — dismissing it would just hide a
 * blocker.
 */
export function KeyEncryptionWarning(): ReactNode {
  const available = useStore((s) => s.keysEncryptionAvailable)
  const loaded = useStore((s) => s.keysLoaded)

  // Don't show the banner during the brief startup window before
  // keys:available has resolved. The default value is `true` so the
  // banner is hidden by default — this `loaded` check is belt-and-
  // suspenders to avoid a flash if the IPC takes a moment.
  if (!loaded || available) return null

  return (
    <div
      role="alert"
      className="shrink-0 border-b border-yellow-500/40 bg-yellow-900/30 px-4 py-2"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-sm" aria-hidden="true">
          ⚠️
        </span>
        <div className="flex-1 text-xs leading-relaxed text-yellow-200">
          <strong className="text-yellow-100">OS key storage unavailable.</strong>{' '}
          Consilium uses your operating system's encrypted keychain (Keychain on macOS, DPAPI on
          Windows, libsecret/kwallet on Linux) to protect API keys. None of these are available
          on this system, so the app{' '}
          <strong className="text-yellow-100">cannot save API keys</strong> until the issue is
          resolved. Existing keys you've already saved (if any) cannot be loaded either. Linux
          users: install{' '}
          <code className="rounded bg-yellow-950/60 px-1 py-0.5 font-mono text-[10px]">
            gnome-keyring
          </code>{' '}
          or{' '}
          <code className="rounded bg-yellow-950/60 px-1 py-0.5 font-mono text-[10px]">
            libsecret-1-0
          </code>{' '}
          (or your distro's equivalent) and relaunch.
        </div>
      </div>
    </div>
  )
}
