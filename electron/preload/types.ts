export interface StoredKey {
  readonly providerId: string
  readonly rawKey: string
  readonly provider?: string | undefined
  readonly baseUrl?: string | undefined
}

export interface ConsiliumAPI {
  readonly platform: string
  getUserDataPath(): Promise<string>
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
  adaptersLoad(): Promise<readonly Record<string, unknown>[]>
  adaptersSave(def: Record<string, unknown>): Promise<void>
  adaptersDelete(id: string): Promise<void>
  personasLoad(): Promise<readonly Record<string, unknown>[]>
  personasSave(persona: Record<string, unknown>): Promise<void>
  personasDelete(id: string): Promise<boolean>
  customProvidersLoad(): Promise<readonly Record<string, unknown>[]>
  customProvidersSave(providers: readonly Record<string, unknown>[]): Promise<void>
  customModelsLoad(): Promise<Readonly<Record<string, readonly string[]>>>
  customModelsSave(models: Readonly<Record<string, readonly string[]>>): Promise<void>
  customModelsAdd(provider: string, modelId: string): Promise<void>
  documentsLoad(id: string): Promise<Record<string, unknown> | null>
  documentsSave(doc: Record<string, unknown>): Promise<void>
  documentsDelete(id: string): Promise<boolean>
  configLoad(): Promise<{ values: Record<string, unknown>; descriptions: Record<string, string> }>
  configSave(config: Record<string, unknown>): Promise<void>
  sessionSave(id: string, content: string): Promise<void>
  sessionLoad(id: string): Promise<string | null>
  sessionList(): Promise<readonly { id: string; name: string; updatedAt: number }[]>
  sessionDelete(id: string): Promise<void>
  toggleDevTools(): Promise<void>
  sessionSaveSync(id: string, content: string): boolean
}
