import { type ReactNode, useCallback } from 'react'
import { useStore } from '@/store'
import { Tooltip } from '@/features/ui/Tooltip'
import { exportToMarkdown } from './markdown-exporter'

export function ExportButton(): ReactNode {
  const messages = useStore((s) => s.messages)
  const archivedMessages = useStore((s) => s.archivedMessages)
  const windows = useStore((s) => s.windows)
  const windowOrder = useStore((s) => s.windowOrder)

  const handleExport = useCallback(() => {
    // Combine archived + current messages for full export
    const allMessages = [...archivedMessages, ...messages]
    if (allMessages.length === 0) return

    const windowMeta = new Map(
      Object.entries(windows).map(([id, w]) => [
        id,
        { personaLabel: w.personaLabel, model: w.model, accentColor: w.accentColor },
      ]),
    )

    // Derive session name from active persona labels
    const personaLabels = windowOrder
      .map((id) => windows[id]?.personaLabel)
      .filter((label): label is string => label !== undefined)
    const sessionName = personaLabels.length > 0
      ? `Consilium — ${personaLabels.join(', ')}`
      : 'Consilium Session'

    const markdown = exportToMarkdown({
      messages: allMessages,
      sessionName,
      sessionId: 'export',
      windowMeta,
    })

    // Create downloadable blob
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `consilium-export-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    // Delay revocation to ensure browsers (especially Firefox) finish the download
    setTimeout(() => URL.revokeObjectURL(url), 500)
  }, [messages, archivedMessages, windows, windowOrder])

  if (messages.length === 0 && archivedMessages.length === 0) return null

  return (
    <Tooltip text="Export session as markdown" position="bottom">
      <button
        onClick={handleExport}
        className="rounded border border-edge-subtle px-2 py-0.5 text-xs text-content-muted hover:border-edge-focus hover:text-content-primary"
      >
        Export
      </button>
    </Tooltip>
  )
}
