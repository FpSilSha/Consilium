import type { Message, AdvisorWindow, TurnMode, QueueCard } from '@/types'

export interface SessionFile {
  readonly version: 1
  readonly id: string
  readonly name: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly windows: readonly SessionWindow[]
  readonly messages: readonly Message[]
  readonly archivedMessages: readonly Message[]
  readonly queue: readonly QueueCard[]
  readonly turnMode: TurnMode
  readonly sessionInstructions: string
  readonly totalCost: number
  readonly inputFiles: readonly SessionFileRef[]
  readonly outputFiles: readonly SessionFileRef[]
}

export interface SessionWindow {
  readonly id: string
  readonly provider: string
  readonly keyId: string
  readonly model: string
  readonly personaId: string
  readonly personaLabel: string
  readonly personaFilename: string
  readonly accentColor: string
  readonly runningCost: number
  readonly isCompacted: boolean
  readonly bufferSize: number
}

export interface SessionFileRef {
  readonly relativePath: string
  readonly originalName: string
  readonly addedAt: number
}

export interface SessionMetadata {
  readonly id: string
  readonly name: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly windowCount: number
  readonly messageCount: number
  readonly totalCost: number
}
