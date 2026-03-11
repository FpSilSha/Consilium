import { type ReactNode, useCallback } from 'react'
import { useStore } from '@/store'
import { exportToMarkdown } from './markdown-exporter'

export function ExportButton(): ReactNode {
  const messages = useStore((s) => s.messages)
  const archivedMessages = useStore((s) => s.archivedMessages)
  const windows = useStore((s) => s.windows)

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

    const markdown = exportToMarkdown({
      messages: allMessages,
      sessionName: 'Consilium Session',
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
  }, [messages, archivedMessages, windows])

  if (messages.length === 0 && archivedMessages.length === 0) return null

  return (
    <button
      onClick={handleExport}
      className="rounded border border-gray-700 px-2 py-0.5 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200"
      title="Export session as markdown"
    >
      Export
    </button>
  )
}
