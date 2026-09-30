import type { SessionFile } from './session-types'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function nonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
function strings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string')
}
function arrayOf(value: unknown, valid: (entry: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(valid)
}
function modelConfig(value: unknown): boolean {
  return value === null || (record(value) && strings(value, ['provider', 'model', 'keyId']))
}
function sessionWindow(value: unknown): boolean {
  return record(value)
    && strings(value, ['id', 'provider', 'keyId', 'model', 'personaId', 'personaLabel', 'accentColor'])
    && nonNegative(value['runningCost']) && nonNegative(value['bufferSize'])
    && typeof value['isCompacted'] === 'boolean'
    && (value['compactedSummary'] == null || typeof value['compactedSummary'] === 'string')
}
function message(value: unknown): boolean {
  if (!record(value) || !strings(value, ['id', 'content', 'personaLabel', 'windowId'])
    || !['user', 'assistant', 'system'].includes(value['role'] as string)
    || !nonNegative(value['timestamp'])) return false
  const cost = value['costMetadata']
  if (cost !== undefined && (!record(cost)
    || !nonNegative(cost['inputTokens']) || !nonNegative(cost['outputTokens'])
    || !nonNegative(cost['estimatedCost']) || typeof cost['isEstimate'] !== 'boolean'
    || (cost['billing'] !== undefined && cost['billing'] !== 'api' && cost['billing'] !== 'subscription'))) return false
  const attachments = value['attachments']
  return attachments === undefined || arrayOf(attachments, (a) => record(a)
    && strings(a, ['id', 'name', 'mimeType', 'data'])
    && (a['type'] === 'image' || a['type'] === 'text') && nonNegative(a['sizeBytes']))
}
function queueCard(value: unknown): boolean {
  return record(value) && strings(value, ['id', 'windowId'])
    && typeof value['isUser'] === 'boolean'
    && ['waiting', 'active', 'completed', 'errored', 'skipped'].includes(value['status'] as string)
    && (value['errorLabel'] === null || typeof value['errorLabel'] === 'string')
}
function fileRef(value: unknown): boolean {
  return record(value) && strings(value, ['relativePath', 'originalName']) && nonNegative(value['addedAt'])
}

/** Validate the full saved state before any destructive restore actions. */
export function isValidSessionFile(data: unknown): data is SessionFile {
  if (!record(data) || (data['version'] !== 1 && data['version'] !== 2)
    || !strings(data, ['id', 'name']) || !/^[a-zA-Z0-9_-]+$/.test(data['id'] as string)
    || !['sequential', 'parallel', 'manual', 'queue'].includes(data['turnMode'] as string)
    || (data['sessionInstructions'] != null && typeof data['sessionInstructions'] !== 'string')
    || !nonNegative(data['totalCost']) || !nonNegative(data['createdAt']) || !nonNegative(data['updatedAt'])
    || !arrayOf(data['windows'], sessionWindow) || !arrayOf(data['messages'], message)
    || !arrayOf(data['archivedMessages'], message) || !arrayOf(data['queue'], queueCard)
    || !arrayOf(data['inputFiles'], fileRef) || !arrayOf(data['outputFiles'], fileRef)) return false

  const budget = data['sessionBudget']
  const loopCount = data['loopCount']
  if ((data['version'] === 2 || budget !== undefined) && !nonNegative(budget)) return false
  if ((data['version'] === 2 || loopCount !== undefined)
    && (!nonNegative(loopCount) || !Number.isInteger(loopCount))) return false

  const ac = data['autoCompaction']
  if (ac !== undefined && (!record(ac) || typeof ac['enabled'] !== 'boolean' || !modelConfig(ac['config']))) return false
  const docs = data['documentIds']
  if (docs !== undefined && !arrayOf(docs, (id) => typeof id === 'string')) return false
  const compileCost = data['sessionCompileCost']
  if (compileCost !== undefined && !nonNegative(compileCost)) return false
  return true
}
