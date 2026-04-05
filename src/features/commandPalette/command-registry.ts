import { useStore } from '@/store'
import { startRun, stopAll, dispatchNextTurn } from '@/features/turnManager'
import { saveCurrentSession, initializeNewSession } from '@/features/sessions/session-manager'
import { buildInitialQueue } from '@/features/turnManager/queue-builder'
import { createDefaultAdvisorWindow } from '@/features/windows/advisor-factory'
import type { TurnMode } from '@/types'

export interface Command {
  readonly id: string
  readonly label: string
  readonly keywords: readonly string[]
  readonly execute: () => void
  readonly isAvailable: () => boolean
}

function switchMode(mode: TurnMode): void {
  const state = useStore.getState()
  state.setTurnMode(mode)
  const newQueue = buildInitialQueue(state.windowOrder, mode)
  state.setQueue(newQueue)
}

export function getCommands(): readonly Command[] {
  return [
    {
      id: 'start-run',
      label: 'Start Run',
      keywords: ['start', 'run', 'go', 'begin'],
      execute: startRun,
      isAvailable: () => !useStore.getState().isRunning,
    },
    {
      id: 'pause-run',
      label: 'Pause Run',
      keywords: ['pause', 'hold', 'wait'],
      execute: () => useStore.getState().setPaused(true),
      isAvailable: () => { const s = useStore.getState(); return s.isRunning && !s.isPaused },
    },
    {
      id: 'resume-run',
      label: 'Resume Run',
      keywords: ['resume', 'continue', 'unpause'],
      execute: () => { useStore.getState().setPaused(false); dispatchNextTurn() },
      isAvailable: () => { const s = useStore.getState(); return s.isRunning && s.isPaused },
    },
    {
      id: 'stop-run',
      label: 'Stop Run',
      keywords: ['stop', 'cancel', 'halt', 'abort'],
      execute: stopAll,
      isAvailable: () => useStore.getState().isRunning,
    },
    {
      id: 'mode-sequential',
      label: 'Sequential Mode',
      keywords: ['sequential', 'seq', 'round-robin'],
      execute: () => switchMode('sequential'),
      isAvailable: () => !useStore.getState().isRunning,
    },
    {
      id: 'mode-parallel',
      label: 'Parallel Mode',
      keywords: ['parallel', 'par', 'simultaneous', 'all'],
      execute: () => switchMode('parallel'),
      isAvailable: () => !useStore.getState().isRunning,
    },
    {
      id: 'mode-manual',
      label: 'Manual Mode',
      keywords: ['manual', 'man', 'trigger'],
      execute: () => switchMode('manual'),
      isAvailable: () => !useStore.getState().isRunning,
    },
    {
      id: 'mode-queue',
      label: 'Queue Mode',
      keywords: ['queue', 'custom', 'drag', 'order'],
      execute: () => switchMode('queue'),
      isAvailable: () => !useStore.getState().isRunning,
    },
    {
      id: 'add-advisor',
      label: 'Add Advisor',
      keywords: ['add', 'advisor', 'new', 'agent'],
      execute: () => {
        const s = useStore.getState()
        createDefaultAdvisorWindow(s.windowOrder, s.personas, s.keys)
          .then((newWindow) => useStore.getState().addWindow(newWindow))
          .catch(() => {})
      },
      isAvailable: () => true,
    },
    {
      id: 'open-models-keys',
      label: 'Open Models & Keys',
      keywords: ['models', 'keys', 'config', 'settings', 'api'],
      execute: () => useStore.getState().setConfigModalOpen(true),
      isAvailable: () => true,
    },
    {
      id: 'new-session',
      label: 'New Consilium',
      keywords: ['new', 'session', 'consilium', 'clear', 'reset'],
      execute: () => {
        stopAll()
        saveCurrentSession().catch(() => {})
        const s = useStore.getState()
        s.clearMessages()
        s.clearAllWindows()
        s.setCurrentSessionId(null)
        s.setSessionCustomName(null)
        initializeNewSession().catch(() => {})
      },
      isAvailable: () => true,
    },
    {
      id: 'call-vote',
      label: 'Call for Vote',
      keywords: ['vote', 'poll', 'yay', 'nay'],
      execute: () => {
        // Trigger the vote button click via DOM — vote requires a question input
        const btn = document.querySelector<HTMLButtonElement>('[data-action="call-vote"]')
        btn?.click()
      },
      isAvailable: () => useStore.getState().windowOrder.length > 0,
    },
  ]
}
