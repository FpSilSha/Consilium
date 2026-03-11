import { create } from 'zustand'
import type { RootState } from './types'
import { createKeysSlice } from './slices/keysSlice'
import { createPersonasSlice } from './slices/personasSlice'
import { createThemesSlice } from './slices/themesSlice'

export const useStore = create<RootState>()((...args) => ({
  ...createKeysSlice(...args),
  ...createPersonasSlice(...args),
  ...createThemesSlice(...args),
}))

export type { RootState } from './types'
