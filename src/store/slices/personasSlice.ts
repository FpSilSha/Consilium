import type { StateCreator } from 'zustand'
import type { Persona } from '@/types'
import { BUILT_IN_PERSONAS } from '@/features/personas'

export interface PersonasSlice {
  readonly personas: readonly Persona[]
  readonly personasLoaded: boolean
  setPersonas: (personas: readonly Persona[]) => void
  setPersonasLoaded: (loaded: boolean) => void
}

export const createPersonasSlice: StateCreator<PersonasSlice> = (set) => ({
  personas: BUILT_IN_PERSONAS,
  personasLoaded: false,

  setPersonas: (personas) => set({ personas }),

  setPersonasLoaded: (loaded) => set({ personasLoaded: loaded }),
})
