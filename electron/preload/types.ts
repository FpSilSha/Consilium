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
}
