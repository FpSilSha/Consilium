import type { StateCreator } from 'zustand'
import type { Theme } from '@/types'

export interface ThemesSlice {
  readonly activeThemeId: string | null
  readonly themes: readonly Theme[]
}

export const createThemesSlice: StateCreator<ThemesSlice> = () => ({
  activeThemeId: null,
  themes: [],
})
