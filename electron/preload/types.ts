export interface StoredKey {
  readonly providerId: string
  readonly rawKey: string
  readonly provider?: string | undefined
  readonly baseUrl?: string | undefined
}

export interface ConsiliumAPI {
  readonly platform: string
  getUserDataPath(): Promise<string>
  readEnvFile(): Promise<Readonly<Record<string, string>>>
  writeEnvFile(entries: Readonly<Record<string, string>>): Promise<void>
  openFolder(path: string): Promise<void>
  keysAvailable(): Promise<boolean>
  keysLoad(): Promise<readonly StoredKey[]>
  keysSave(providerId: string, rawKey: string, metadata?: { provider?: string; baseUrl?: string }): Promise<void>
  keysDelete(providerId: string): Promise<void>
  catalogPrefsLoad(): Promise<unknown>
  catalogPrefsSave(data: unknown): Promise<void>
  openFileDialog(filters?: readonly { name: string; extensions: string[] }[]): Promise<readonly { name: string; mimeType: string; data: string; sizeBytes: number }[]>
  saveFileDialog(defaultName: string, content: string, filters?: readonly { name: string; extensions: string[] }[]): Promise<boolean>
  windowMinimize(): Promise<void>
  windowMaximize(): Promise<void>
  windowClose(): Promise<void>
  windowIsMaximized(): Promise<boolean>
  openExternal(url: string): Promise<void>
  onMenuAction(callback: (action: string) => void): () => void
  configLoad(): Promise<{ values: Record<string, unknown>; descriptions: Record<string, string> }>
  configSave(config: Record<string, unknown>): Promise<void>
  sessionSave(id: string, content: string): Promise<void>
  sessionLoad(id: string): Promise<string | null>
  sessionList(): Promise<readonly { id: string; name: string; updatedAt: number }[]>
  sessionDelete(id: string): Promise<void>
}
