import type { KeysSlice } from './slices/keysSlice'
import type { PersonasSlice } from './slices/personasSlice'
import type { ThemesSlice } from './slices/themesSlice'
import type { ContextBusSlice } from './slices/contextBusSlice'

export type RootState = KeysSlice & PersonasSlice & ThemesSlice & ContextBusSlice
