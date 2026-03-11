import type { KeysSlice } from './slices/keysSlice'
import type { PersonasSlice } from './slices/personasSlice'
import type { ThemesSlice } from './slices/themesSlice'

export type RootState = KeysSlice & PersonasSlice & ThemesSlice
