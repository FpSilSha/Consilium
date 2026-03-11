import type { StateCreator } from 'zustand'
import type { Persona } from '@/types'

export interface PersonasSlice {
  readonly personas: readonly Persona[]
  readonly personasLoaded: boolean
  setPersonas: (personas: readonly Persona[]) => void
  setPersonasLoaded: (loaded: boolean) => void
}

export const createPersonasSlice: StateCreator<PersonasSlice> = (set) => ({
  personas: [],
  personasLoaded: false,

  setPersonas: (personas) => set({ personas }),

  setPersonasLoaded: (loaded) => set({ personasLoaded: loaded }),
})
