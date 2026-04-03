import type { CustomAdapterDefinition } from '@/types'

/**
 * Exports an adapter definition as a JSON file via the save dialog.
 */
export async function exportAdapterDefinition(def: CustomAdapterDefinition): Promise<void> {
  const api = (window as { consiliumAPI?: { saveFileDialog: (name: string, content: string) => Promise<boolean> } }).consiliumAPI
  if (api == null) return

  const filename = `${def.id}-adapter.json`
  const content = JSON.stringify(def, null, 2)
  await api.saveFileDialog(filename, content)
}

/**
 * Imports an adapter definition from a JSON file via the open dialog.
 * Validates the shape before returning.
 */
export async function importAdapterDefinition(): Promise<CustomAdapterDefinition | null> {
  const api = (window as { consiliumAPI?: { openFileDialog: (f?: unknown) => Promise<readonly { name: string; mimeType: string; data: string; sizeBytes: number }[]> } }).consiliumAPI
  if (api == null) return null

  const files = await api.openFileDialog([{ name: 'JSON', extensions: ['json'] }])
  if (files.length === 0) return null

  const file = files[0]!
  try {
    const parsed: unknown = JSON.parse(file.data)
    if (!isValidDefinition(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

function isValidDefinition(obj: unknown): obj is CustomAdapterDefinition {
  if (obj == null || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return (
    typeof o['id'] === 'string' && o['id'] !== '' &&
    typeof o['name'] === 'string' && o['name'] !== '' &&
    typeof o['request'] === 'object' && o['request'] != null &&
    typeof o['response'] === 'object' && o['response'] != null &&
    typeof o['createdAt'] === 'number' &&
    typeof o['updatedAt'] === 'number'
  )
}
