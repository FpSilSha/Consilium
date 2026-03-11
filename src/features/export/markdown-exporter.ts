import type { Message } from '@/types'

interface ExportOptions {
  readonly messages: readonly Message[]
  readonly sessionName: string
  readonly sessionId: string
  readonly windowMeta: ReadonlyMap<string, WindowMeta>
}

interface WindowMeta {
  readonly personaLabel: string
  readonly model: string
  readonly accentColor: string
}

/**
 * Exports the full session as a markdown string.
 * Each message includes timestamp, agent label, model, and persona.
 */
export function exportToMarkdown(options: ExportOptions): string {
  const { messages, sessionName, windowMeta } = options
  const lines: string[] = []

  lines.push(`# ${sessionName}`)
  lines.push('')
  lines.push(`*Exported: ${new Date().toISOString()}*`)
  lines.push(`*Messages: ${messages.length}*`)
  lines.push('')
  lines.push('---')
  lines.push('')

  let lastWindowId = ''
  let lastModel = ''
  let lastPersonaLabel = ''

  for (const msg of messages) {
    const meta = windowMeta.get(msg.windowId)

    // Detect structural changes and insert dividers
    const changes = detectChanges(
      msg,
      meta,
      lastWindowId,
      lastModel,
      lastPersonaLabel,
    )
    if (changes.length > 0) {
      lines.push('')
      lines.push('```')
      lines.push('═══════════════════════════════════════════')
      for (const change of changes) {
        lines.push(`  ${change}`)
      }
      lines.push('═══════════════════════════════════════════')
      lines.push('```')
      lines.push('')
    }

    // Format timestamp
    const ts = new Date(msg.timestamp)
    const timeStr = ts.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    // Format message
    const modelInfo = meta !== undefined ? ` (${meta.model})` : ''
    lines.push(`### [${timeStr}] ${msg.personaLabel}${modelInfo}`)
    lines.push('')
    lines.push(msg.content)
    lines.push('')

    // Track state for change detection
    lastWindowId = msg.windowId
    lastModel = meta?.model ?? ''
    lastPersonaLabel = meta?.personaLabel ?? msg.personaLabel
  }

  return lines.join('\n')
}

function detectChanges(
  msg: Message,
  meta: WindowMeta | undefined,
  lastWindowId: string,
  lastModel: string,
  lastPersonaLabel: string,
): readonly string[] {
  if (lastWindowId === '' || msg.windowId !== lastWindowId) return []

  const changes: string[] = []
  const currentModel = meta?.model ?? ''
  const currentLabel = meta?.personaLabel ?? msg.personaLabel

  if (lastModel !== '' && currentModel !== '' && lastModel !== currentModel) {
    changes.push(`Model changed from ${lastModel} → ${currentModel}`)
  }

  if (lastPersonaLabel !== '' && currentLabel !== lastPersonaLabel) {
    changes.push(`Persona switched from "${lastPersonaLabel}" → "${currentLabel}"`)
  }

  return changes
}
