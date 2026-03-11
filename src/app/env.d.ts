/// <reference types="vite/client" />

import type { ConsiliumAPI } from '../../electron/preload/types'

declare global {
  interface Window {
    readonly consiliumAPI: ConsiliumAPI | undefined
  }
}

export {}
