import type { ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { AdvisorWindow } from '@/types'
import { useStore } from '@/store'
import { getAccentColor, BUILT_IN_THEMES } from '@/features/themes'
import { createAgentCard } from '@/features/turnManager'

export function AddAdvisorButton(): ReactNode {
  const addWindow = useStore((s) => s.addWindow)
  const addToQueue = useStore((s) => s.addToQueue)
  const windowOrder = useStore((s) => s.windowOrder)
  const personas = useStore((s) => s.personas)
  const keys = useStore((s) => s.keys)

  const handleAdd = (): void => {
    const defaultTheme = BUILT_IN_THEMES[0]!
    const accentColor = getAccentColor(
      windowOrder.length,
      defaultTheme.colors.accentPalette,
    )

    const firstPersona = personas[0]
    const firstKey = keys[0]

    const newWindow: AdvisorWindow = {
      id: uuidv4(),
      provider: firstKey?.provider ?? 'anthropic',
      keyId: firstKey?.id ?? '',
      model: 'claude-sonnet-4-5-20241022',
      personaId: firstPersona?.id ?? '',
      personaLabel: firstPersona?.name ?? 'Advisor',
      accentColor,
      runningCost: 0,
      isStreaming: false,
      streamContent: '',
      error: null,
      isCompacted: false,
      bufferSize: 15,
    }

    addWindow(newWindow)
    addToQueue(createAgentCard(newWindow.id))
  }

  return (
    <button
      onClick={handleAdd}
      className="flex h-7 w-7 items-center justify-center rounded border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
      title="Add advisor"
    >
      +
    </button>
  )
}
