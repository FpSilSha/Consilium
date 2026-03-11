import type { StateCreator } from 'zustand'
import type { Persona } from '@/types'

export interface PersonasSlice {
  readonly personas: readonly Persona[]
}

export const createPersonasSlice: StateCreator<PersonasSlice> = () => ({
  personas: [],
})
