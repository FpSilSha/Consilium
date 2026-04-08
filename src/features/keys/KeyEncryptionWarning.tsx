import { type ReactNode, useState } from 'react'
import { useStore } from '@/store'

/**
 * Per-platform remediation text. Reads `window.consiliumAPI.platform`
 * (exposed via the preload bridge — same value as Node's
 * `process.platform`) to figure out which advice to show.
 *
 * The 'unknown' fallback covers the case where the preload bridge
 * itself isn't reachable (running in a browser tab, broken
 * contextBridge), in which case we show a generic message that
 * doesn't claim to know what OS you're on.
 */
function getPlatformAdvice(platform: string | undefined): ReactNode {
  if (platform === 'linux') {
    return (
      <>
        Install{' '}
        <code className="rounded bg-yellow-950/60 px-1 py-0.5 font-mono text-[10px]">
          gnome-keyring
        </code>{' '}
        or{' '}
        <code className="rounded bg-yellow-950/60 px-1 py-0.5 font-mono text-[10px]">
          libsecret-1-0
        </code>{' '}
        (or your distro's equivalent — kwallet on KDE) and relaunch to enable persistent
        storage.
      </>
    )
  }
  if (platform === 'darwin') {
    return (
      <>
        macOS Keychain is normally available out of the box. This usually means the login
        keychain is locked or your user profile's Keychain database is corrupted. Open{' '}
        <strong className="text-yellow-100">Keychain Access</strong>, verify the login
        keychain is unlocked, and relaunch. If the issue persists, repairing the login
        keychain (File → Delete Keychain "login" → set up a new one) typically resolves it.
      </>
    )
  }
  if (platform === 'win32') {
    return (
      <>
        Windows DPAPI is normally available out of the box. This usually means an Electron
        version mismatch or a corrupted user profile. Try restarting the app first; if the
        problem persists, restart Windows. If it still fails after a reboot, this may
        indicate a Windows user profile issue — running as a different Windows user account
        is the quickest test.
      </>
    )
  }
  return (
    <>
      Your operating system did not advertise an encrypted credential store. Persistent key
      storage is unavailable on this system. Install or repair your platform's secret
      service and relaunch.
    </>
  )
}

/**
 * Banner shown at the top of the app when Electron's safeStorage
 * encryption is unavailable on the current OS. Triggered by the
 * startup key loader (loadPersistedKeys) calling
 * keysAvailable() over IPC.
 *
 * Common case: a Linux user without gnome-keyring / libsecret /
 * kwallet installed. Less common: an Electron version mismatch on
 * macOS or Windows.
 *
 * Behavior when encryption is unavailable:
 *
 *   - The user can still ENTER and USE API keys for the current
 *     session. KeyManager.handleAddKey adds the key to the in-memory
 *     vault + Zustand store unconditionally; only the disk-write
 *     IPC (consiliumAPI.keysSave) fails, and that's wrapped in a
 *     non-fatal try/catch.
 *
 *   - The keys ARE NOT persisted to disk. On next launch, the keys
 *     file is empty (loadPersistedKeys early-returns when encryption
 *     is unavailable), and the user has to re-enter their keys.
 *
 *   - The user accepts this trade-off via the dismiss button on
 *     this banner. Dismiss is per-session only — closing and
 *     reopening the app shows the banner again, since the underlying
 *     issue is still present and the user should be reminded each
 *     time they start fresh.
 */
export function KeyEncryptionWarning(): ReactNode {
  const available = useStore((s) => s.keysEncryptionAvailable)
  const loaded = useStore((s) => s.keysLoaded)
  // Local state for dismiss. Lives only as long as this component
  // is mounted, which in practice means "until the app is closed"
  // since AppLayout mounts the banner once. The user gets a fresh
  // reminder on every relaunch — appropriate for a security
  // disclosure they're explicitly opting around.
  const [dismissed, setDismissed] = useState(false)

  // Don't show the banner during the brief startup window before
  // keys:available has resolved. The default value is `true` so the
  // banner is hidden by default — this `loaded` check is belt-and-
  // suspenders to avoid a flash if the IPC takes a moment.
  if (!loaded || available || dismissed) return null

  // Read platform from the preload bridge. May be undefined if the
  // bridge itself is missing — getPlatformAdvice handles that case.
  const platform = (window as { consiliumAPI?: { platform?: string } }).consiliumAPI?.platform
  const advice = getPlatformAdvice(platform)

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
          Consilium normally protects your API keys using your operating system's encrypted
          keychain (Keychain on macOS, DPAPI on Windows, libsecret/kwallet on Linux), but none
          of those are available on this system. You can still{' '}
          <strong className="text-yellow-100">enter and use API keys for this session</strong>{' '}
          — they'll work normally — but they{' '}
          <strong className="text-yellow-100">will not be saved to disk</strong> and you'll
          need to re-enter them every time you start the app. {advice}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded px-2 py-1 text-[10px] font-medium text-yellow-300 transition-colors hover:bg-yellow-900/40 hover:text-yellow-100"
          aria-label="Dismiss warning"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
