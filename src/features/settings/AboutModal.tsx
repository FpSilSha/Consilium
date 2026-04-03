import type { ReactNode } from 'react'

interface AboutModalProps {
  readonly onClose: () => void
}

export function AboutModal({ onClose }: AboutModalProps): ReactNode {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-xl border border-edge-subtle bg-surface-panel p-6 text-center"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        <h2 id="about-title" className="text-lg font-semibold text-content-primary">
          Consilium
        </h2>
        <p className="mt-1 text-xs text-content-muted">
          Council of Advisors
        </p>
        <p className="mt-3 text-xs text-content-disabled">
          A multi-agent AI orchestration app where you lead a panel of
          AI advisors, each with its own model, provider, and persona.
        </p>

        <div className="mt-4 flex flex-col gap-1.5">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); openExternal('https://github.com/FpSilSha/Consilium') }}
            className="text-xs text-accent-blue transition-colors hover:text-accent-blue/80"
          >
            GitHub
          </a>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); openExternal('https://github.com/FpSilSha/Consilium/wiki') }}
            className="text-xs text-accent-blue transition-colors hover:text-accent-blue/80"
          >
            Documentation
          </a>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); openExternal('https://github.com/FpSilSha/Consilium/issues/new') }}
            className="text-xs text-accent-blue transition-colors hover:text-accent-blue/80"
          >
            Report Issue
          </a>
        </div>

        <button
          onClick={onClose}
          autoFocus
          className="mt-4 rounded-md bg-surface-hover px-4 py-1.5 text-xs text-content-muted transition-colors hover:bg-surface-active"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function openExternal(url: string): void {
  const api = (window as { consiliumAPI?: { openExternal: (url: string) => Promise<void> } }).consiliumAPI
  api?.openExternal(url).catch(() => {})
}
