export interface ConsiliumAPI {
  readonly platform: string
  getUserDataPath(): Promise<string>
  readEnvFile(): Promise<Readonly<Record<string, string>>>
  writeEnvFile(entries: Readonly<Record<string, string>>): Promise<void>
  openFolder(path: string): Promise<void>
}
