import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'

export interface CustomProviderDef {
  readonly id: string
  readonly name: string
  readonly baseUrl: string
  readonly modelListEndpoint: string | null
  readonly healthCheckEndpoint: string | null
  readonly costEndpoint: string | null
}

function getFilePath(): string {
  return join(app.getPath('userData'), 'custom-providers.json')
}

export function loadCustomProviders(): readonly CustomProviderDef[] {
  const filePath = getFilePath()
  if (!existsSync(filePath)) return []

  try {
    const content = readFileSync(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(content)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidProvider)
  } catch {
    return []
  }
}

export function saveCustomProviders(providers: readonly CustomProviderDef[]): void {
  const filePath = getFilePath()
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(providers, null, 2), 'utf-8')
  renameSync(tmpPath, filePath)
}

function isValidProvider(entry: unknown): entry is CustomProviderDef {
  if (entry == null || typeof entry !== 'object') return false
  const e = entry as Record<string, unknown>
  return (
    typeof e['id'] === 'string' && e['id'] !== '' &&
    typeof e['name'] === 'string' && e['name'] !== '' &&
    typeof e['baseUrl'] === 'string' && e['baseUrl'] !== ''
  )
}
