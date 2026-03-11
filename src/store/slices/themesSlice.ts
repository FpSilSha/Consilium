import type { StateCreator } from 'zustand'
import type { Theme } from '@/types'

export interface ThemesSlice {
  readonly activeThemeId: string | null
  readonly themes: readonly Theme[]
  setThemes: (themes: readonly Theme[]) => void
  setActiveThemeId: (id: string) => void
}

export const createThemesSlice: StateCreator<ThemesSlice> = (set) => ({
  activeThemeId: null,
  themes: [],

  setThemes: (themes) => set({ themes }),

  setActiveThemeId: (id) => set({ activeThemeId: id }),
})
