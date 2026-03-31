import type { KeysSlice } from './slices/keysSlice'
import type { PersonasSlice } from './slices/personasSlice'
import type { ThemesSlice } from './slices/themesSlice'
import type { ContextBusSlice } from './slices/contextBusSlice'
import type { WindowsSlice } from './slices/windowsSlice'
import type { UISlice } from './slices/uiSlice'
import type { TurnSlice } from './slices/turnSlice'
import type { BudgetSlice } from './slices/budgetSlice'
import type { ModelCatalogSlice } from './slices/modelCatalogSlice'

export type RootState = KeysSlice & PersonasSlice & ThemesSlice & ContextBusSlice & WindowsSlice & UISlice & TurnSlice & BudgetSlice & ModelCatalogSlice
