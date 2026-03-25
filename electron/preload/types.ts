export interface StoredKey {
  readonly providerId: string
  readonly rawKey: string
}

export interface ConsiliumAPI {
  readonly platform: string
  getUserDataPath(): Promise<string>
  readEnvFile(): Promise<Readonly<Record<string, string>>>
  writeEnvFile(entries: Readonly<Record<string, string>>): Promise<void>
  openFolder(path: string): Promise<void>
  keysAvailable(): Promise<boolean>
  keysLoad(): Promise<readonly StoredKey[]>
  keysSave(providerId: string, rawKey: string): Promise<void>
  keysDelete(providerId: string): Promise<void>
}
