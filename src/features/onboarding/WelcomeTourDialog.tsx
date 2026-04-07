import type { ReactNode } from 'react'

const TOUR_ITEMS = [
  { num: 1, title: 'Shared Context', desc: 'All advisors see the same conversation. Every message is part of a shared thread.' },
  { num: 2, title: 'Turn Modes', desc: 'Sequential (round-robin), Parallel (all at once), Manual (you choose), or Queue (custom order).' },
  { num: 3, title: '@Mentions', desc: 'Type @AgentName to direct a question to a specific advisor.' },
  { num: 4, title: 'Personas', desc: 'Each advisor has a role defined by a .md file in the personas folder.' },
  { num: 5, title: 'Voting', desc: 'Use "Call for Vote" to get YAY/NAY/ABSTAIN from all advisors on any question.' },
  { num: 6, title: 'Command Palette', desc: 'Press Ctrl+K to quickly access actions like starting a run, switching modes, or adding advisors.' },
  { num: 7, title: 'Budget', desc: 'Set a spending cap in the sidebar. Warning at 80%, all API calls halt at 100%.' },
  { num: 8, title: 'Sessions', desc: 'Your conversations are saved automatically. Double-click a session name in the sidebar to rename it.' },
] as const

interface WelcomeTourDialogProps {
  readonly onClose: () => void
}

export function WelcomeTourDialog({ onClose }: WelcomeTourDialogProps): ReactNode {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="mx-4 w-full max-w-lg rounded-xl border border-edge-subtle bg-surface-panel p-6"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        <h2 className="mb-1 text-lg font-semibold text-content-primary">Welcome to Consilium</h2>
        <p className="mb-5 text-xs text-content-muted">
          Your multi-agent AI advisory board. Here&apos;s what you can do:
        </p>

        <div className="flex flex-col gap-3">
          {TOUR_ITEMS.map((item) => (
            <div key={item.num} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-blue/20 text-xs font-bold text-accent-blue">
                {item.num}
              </span>
              <div>
                <div className="text-xs font-medium text-content-primary">{item.title}</div>
                <div className="text-[10px] text-content-muted">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            autoFocus
            className="rounded-lg bg-accent-blue px-4 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
