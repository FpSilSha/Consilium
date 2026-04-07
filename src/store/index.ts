import { create } from 'zustand'
import type { RootState } from './types'
import { createKeysSlice } from './slices/keysSlice'
import { createPersonasSlice } from './slices/personasSlice'
import { createThemesSlice } from './slices/themesSlice'
import { createContextBusSlice } from './slices/contextBusSlice'
import { createWindowsSlice } from './slices/windowsSlice'
import { createUISlice } from './slices/uiSlice'
import { createTurnSlice } from './slices/turnSlice'
import { createBudgetSlice } from './slices/budgetSlice'
import { createModelCatalogSlice } from './slices/modelCatalogSlice'
import { createCustomAdaptersSlice } from './slices/customAdaptersSlice'
import { createDocumentsSlice } from './slices/documentsSlice'
import { createSystemPromptsSlice } from './slices/systemPromptsSlice'
import { createCustomCompilePromptsSlice } from './slices/customCompilePromptsSlice'
import { createCustomCompactPromptsSlice } from './slices/customCompactPromptsSlice'

export const useStore = create<RootState>()((...args) => ({
  ...createKeysSlice(...args),
  ...createPersonasSlice(...args),
  ...createThemesSlice(...args),
  ...createContextBusSlice(...args),
  ...createWindowsSlice(...args),
  ...createUISlice(...args),
  ...createTurnSlice(...args),
  ...createBudgetSlice(...args),
  ...createModelCatalogSlice(...args),
  ...createCustomAdaptersSlice(...args),
  ...createDocumentsSlice(...args),
  ...createSystemPromptsSlice(...args),
  ...createCustomCompilePromptsSlice(...args),
  ...createCustomCompactPromptsSlice(...args),
}))

export type { RootState } from './types'
