import type { Provider } from './provider'

export interface AdvisorWindow {
  readonly id: string
  readonly provider: Provider
  readonly keyId: string
  readonly model: string
  readonly personaId: string
  readonly personaLabel: string
  readonly accentColor: string
  readonly runningCost: number
  readonly isStreaming: boolean
  readonly streamContent: string
  readonly error: string | null
  readonly isCompacted: boolean
  readonly compactedSummary: string | null
  readonly bufferSize: number
}
