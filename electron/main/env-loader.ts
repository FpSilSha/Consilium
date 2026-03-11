import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

function getEnvFilePath(): string {
  return join(app.getPath('userData'), '.env')
}

function parseEnvContent(content: string): Record<string, string> {
  const entries: Record<string, string> = {}

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (key !== '') {
      entries[key] = value
    }
  }

  return entries
}

function serializeEnvEntries(entries: Readonly<Record<string, string>>): string {
  const lines: string[] = ['# Consilium API Keys — managed by the app, do not edit manually']

  for (const [key, value] of Object.entries(entries)) {
    lines.push(`${key}="${value}"`)
  }

  return lines.join('\n') + '\n'
}

export function loadEnvFile(): Record<string, string> {
  const filePath = getEnvFilePath()

  if (!existsSync(filePath)) {
    return {}
  }

  const content = readFileSync(filePath, 'utf-8')
  return parseEnvContent(content)
}

export function writeEnvFile(entries: Readonly<Record<string, string>>): void {
  const filePath = getEnvFilePath()
  const dir = dirname(filePath)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(filePath, serializeEnvEntries(entries), 'utf-8')
}
