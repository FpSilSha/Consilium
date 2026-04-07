import { type ReactNode, useState, useCallback, useRef, useEffect } from 'react'
import { useStore } from '@/store'
import { saveCurrentSession } from '@/features/sessions/session-manager'

interface MenuDef {
  readonly label: string
  readonly items: readonly MenuItem[]
}

interface MenuItem {
  readonly label: string
  readonly action: string
  readonly separator?: false
}

interface MenuSeparator {
  readonly separator: true
}

type MenuEntry = MenuItem | MenuSeparator

const MENUS: readonly { label: string; items: readonly MenuEntry[] }[] = [
  {
    label: 'File',
    items: [
      { label: 'New Consilium', action: 'new-consilium' },
      { separator: true },
      { label: 'Save Session', action: 'save-session' },
      { separator: true },
      { label: 'Quit', action: 'quit' },
    ],
  },
  {
    label: 'Edit',
    items: [
      // Single entry by design — opens the unified Configuration modal
      // which contains panes for personas, prompt libraries, compile,
      // auto-compaction, and the raw config editor. Existing IPC menu
      // actions (auto-compaction-settings, compile-settings, edit-config)
      // remain wired in AppLayout.handleMenuAction so the Electron main
      // process menu and any deep links keep working until tasks #23/#25
      // port the legacy panes inline.
      { label: 'Configuration…', action: 'configuration' },
    ],
  },
  {
    label: 'View',
    items: [
      { label: 'Fullscreen', action: 'fullscreen' },
      { separator: true },
      { label: 'Developer Tools', action: 'devtools' },
    ],
  },
  {
    label: 'Help',
    items: [
      { label: 'Welcome Tour', action: 'welcome-tour' },
      { label: 'About Consilium', action: 'about' },
      { separator: true },
      { label: 'Documentation', action: 'docs' },
      { label: 'Report Issue', action: 'report-issue' },
      { separator: true },
      { label: 'GitHub', action: 'github' },
    ],
  },
]

interface TitleBarProps {
  readonly onMenuAction: (action: string) => void
}

export function TitleBar({ onMenuAction }: TitleBarProps): ReactNode {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const platform = useStore(() => {
    const w = window as { consiliumAPI?: { platform: string } }
    return w.consiliumAPI?.platform ?? 'win32'
  })

  const isMac = platform === 'darwin'

  // Close menu on click outside
  useEffect(() => {
    if (openMenu == null) return
    const handler = (e: MouseEvent) => {
      if (barRef.current != null && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenu])

  const handleAction = useCallback((action: string) => {
    setOpenMenu(null)

    const api = (window as { consiliumAPI?: {
      windowMinimize(): Promise<void>
      windowMaximize(): Promise<void>
      windowClose(): Promise<void>
      openExternal(url: string): Promise<void>
      toggleDevTools(): Promise<void>
    } }).consiliumAPI

    switch (action) {
      case 'new-consilium':
        onMenuAction('menu:new-consilium')
        break
      case 'save-session':
        saveCurrentSession().catch(() => {})
        break
      case 'configuration':
        onMenuAction('menu:configuration')
        break
      // 'edit-config' remains wired for the legacy raw JSON editor
      // modal pending task #25. The compile-settings and
      // auto-compaction-settings cases were removed in task #23
      // when those panes became native — TitleBar's MENUS array
      // never exposed entries for them anyway, the cases were dead
      // before this commit.
      case 'edit-config':
        onMenuAction('menu:edit-config')
        break
      case 'fullscreen':
        document.documentElement.requestFullscreen?.().catch(() => {})
        break
      case 'devtools':
        api?.toggleDevTools?.()
        break
      case 'welcome-tour':
        onMenuAction('menu:welcome-tour')
        break
      case 'about':
        onMenuAction('menu:about')
        break
      case 'docs':
        api?.openExternal('https://github.com/FpSilSha/Consilium/wiki').catch(() => {})
        break
      case 'report-issue':
        api?.openExternal('https://github.com/FpSilSha/Consilium/issues/new').catch(() => {})
        break
      case 'github':
        api?.openExternal('https://github.com/FpSilSha/Consilium').catch(() => {})
        break
      case 'quit':
        api?.windowClose().catch(() => {})
        break
    }
  }, [onMenuAction])

  return (
    <div
      ref={barRef}
      className="relative flex h-8 shrink-0 items-center justify-between border-b border-edge-subtle bg-surface-panel"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onDoubleClick={() => {
        const api = (window as { consiliumAPI?: { windowMaximize(): Promise<void> } }).consiliumAPI
        api?.windowMaximize()
      }}
    >
      {/* Left: menus (+ macOS traffic light offset) */}
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {isMac && <div className="w-20" />}
        {MENUS.map((menu) => (
          <div key={menu.label} className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
              onMouseEnter={() => { if (openMenu != null) setOpenMenu(menu.label) }}
              className={`px-3 py-1 text-xs transition-colors ${
                openMenu === menu.label
                  ? 'bg-surface-hover text-content-primary'
                  : 'text-content-muted hover:bg-surface-hover hover:text-content-primary'
              }`}
            >
              {menu.label}
            </button>

            {openMenu === menu.label && (
              <div className="absolute left-0 top-full z-50 min-w-40 rounded-md border border-edge-subtle bg-surface-panel py-1 shadow-lg">
                {menu.items.map((item, i) =>
                  'separator' in item && item.separator ? (
                    <div key={i} className="my-1 border-t border-edge-subtle" />
                  ) : (
                    <button
                      key={i}
                      onClick={() => handleAction((item as MenuItem).action)}
                      className="flex w-full items-center px-3 py-1.5 text-left text-xs text-content-primary transition-colors hover:bg-surface-hover"
                    >
                      {(item as MenuItem).label}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Center: app title — fixed center regardless of left/right content */}
      <span
        className="pointer-events-none absolute text-sm font-semibold text-content-primary"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
      >
        Consilium
      </span>

      {/* Right: window controls (Windows/Linux only) */}
      {!isMac && (
        <div className="flex" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <WindowControls />
        </div>
      )}
    </div>
  )
}

function WindowControls(): ReactNode {
  const api = (window as { consiliumAPI?: {
    windowMinimize(): Promise<void>
    windowMaximize(): Promise<void>
    windowClose(): Promise<void>
  } }).consiliumAPI

  return (
    <>
      <button
        onClick={() => api?.windowMinimize()}
        className="flex h-8 w-11 items-center justify-center text-content-muted transition-colors hover:bg-surface-hover"
        aria-label="Minimize"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
          <rect width="10" height="1" />
        </svg>
      </button>
      <button
        onClick={() => api?.windowMaximize()}
        className="flex h-8 w-11 items-center justify-center text-content-muted transition-colors hover:bg-surface-hover"
        aria-label="Maximize"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
          <rect x="0.5" y="0.5" width="9" height="9" />
        </svg>
      </button>
      <button
        onClick={() => api?.windowClose()}
        className="flex h-8 w-11 items-center justify-center text-content-muted transition-colors hover:bg-accent-red hover:text-content-inverse"
        aria-label="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
          <line x1="0" y1="0" x2="10" y2="10" />
          <line x1="10" y1="0" x2="0" y2="10" />
        </svg>
      </button>
    </>
  )
}
