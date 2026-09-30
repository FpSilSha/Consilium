import type { RootState } from '@/store'
import type { AdvisorWindow } from '@/types'
import type { SessionWindow } from './session-types'
import { shallow } from 'zustand/vanilla/shallow'

/** The persisted state, excluding generated names and save timestamps. */
export function sessionSnapshot(state: RootState) {
  return {
    currentSessionId: state.currentSessionId,
    sessionCustomName: state.sessionCustomName,
    windows: state.windowOrder
      .map((id) => state.windows[id])
      .filter((w): w is AdvisorWindow => w != null)
      .map((w): SessionWindow => ({
        id: w.id, provider: w.provider, keyId: w.keyId, model: w.model,
        personaId: w.personaId, personaLabel: w.personaLabel, personaFilename: '',
        accentColor: w.accentColor, runningCost: w.runningCost,
        isCompacted: w.isCompacted, compactedSummary: w.compactedSummary,
        bufferSize: w.bufferSize,
      })),
    messages: state.messages,
    archivedMessages: state.archivedMessages,
    queue: state.queue,
    turnMode: state.turnMode,
    sessionInstructions: state.sessionInstructions,
    sessionBudget: state.sessionBudget,
    loopCount: state.loopCount,
    autoCompactionEnabled: state.autoCompactionEnabled,
    autoCompactionConfig: state.autoCompactionConfig,
    documentIds: state.documentIds,
    sessionCompileCost: state.sessionCompileCost,
  }
}

type SessionSnapshot = ReturnType<typeof sessionSnapshot>

export function sameSessionSnapshot(a: SessionSnapshot, b: SessionSnapshot): boolean {
  const { windows: aw, ...aFields } = a
  const { windows: bw, ...bFields } = b
  return shallow(aFields, bFields)
    && aw.length === bw.length
    && aw.every((window, index) => shallow(window, bw[index]))
}
