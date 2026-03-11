import { create } from 'zustand'
import type { RootState } from './types'
import { createKeysSlice } from './slices/keysSlice'
import { createPersonasSlice } from './slices/personasSlice'
import { createThemesSlice } from './slices/themesSlice'
import { createContextBusSlice } from './slices/contextBusSlice'
import { createWindowsSlice } from './slices/windowsSlice'
import { createUISlice } from './slices/uiSlice'

export const useStore = create<RootState>()((...args) => ({
  ...createKeysSlice(...args),
  ...createPersonasSlice(...args),
  ...createThemesSlice(...args),
  ...createContextBusSlice(...args),
  ...createWindowsSlice(...args),
  ...createUISlice(...args),
}))

export type { RootState } from './types'
