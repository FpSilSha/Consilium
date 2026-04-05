import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'

function getFilePath(): string {
  return join(app.getPath('userData'), 'custom-models.json')
}

/**
 * Loads user-added custom model IDs per provider.
 * Format: { "openrouter": ["model-id-1", "model-id-2"], ... }
 */
export function loadCustomModels(): Readonly<Record<string, readonly string[]>> {
  const filePath = getFilePath()
  if (!existsSync(filePath)) return {}

  try {
    const content = readFileSync(filePath, 'utf-8')
    const parsed: unknown = JSON.parse(content)
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const result: Record<string, readonly string[]> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        result[key] = value as string[]
      }
    }
    return result
  } catch {
    return {}
  }
}

export function saveCustomModels(models: Readonly<Record<string, readonly string[]>>): void {
  const filePath = getFilePath()
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(models, null, 2), 'utf-8')
  renameSync(tmpPath, filePath)
}
