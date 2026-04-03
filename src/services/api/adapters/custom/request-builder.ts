import type { CustomRequestTemplate } from '@/types'
import type { ApiRequestConfig } from '../../types'
import { setByPath } from './field-accessor'

/**
 * Builds an HTTP request from a custom adapter template and API config.
 * Pure data transformation — no side effects, no network calls.
 */
export function buildCustomRequest(
  template: CustomRequestTemplate,
  config: ApiRequestConfig,
): { readonly url: string; readonly headers: Record<string, string>; readonly body: string } {
  // URL — optionally interpolate ${model}
  const url = template.urlModelInterpolation
    ? template.url.replace('${model}', encodeURIComponent(config.model))
    : template.url

  // Headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [template.authHeaderName]: `${template.authHeaderValuePrefix}${config.apiKey}`,
    ...template.extraHeaders,
  }

  // Body
  const bodyObj: Record<string, unknown> = {
    [template.body.modelField]: config.model,
    [template.body.maxTokensField]: config.maxTokens ?? 4096,
    [template.body.streamField]: template.body.streamValue,
    ...template.body.extraFields,
  }

  // System prompt placement
  switch (template.body.systemPromptPlacement) {
    case 'top-level':
      bodyObj[template.body.systemPromptPath] = config.systemPrompt
      break
    case 'first-message':
      // Handled below when building messages
      break
    case 'nested': {
      const nested = setByPath(template.body.systemPromptPath, config.systemPrompt)
      deepMerge(bodyObj, nested)
      break
    }
  }

  // Messages
  const messages: Record<string, unknown>[] = []

  // If system prompt goes as first message
  if (template.body.systemPromptPlacement === 'first-message' && config.systemPrompt !== '') {
    messages.push({
      [template.body.roleField]: template.body.roleMapping['system'] ?? 'system',
      [template.body.contentField]: config.systemPrompt,
    })
  }

  for (const msg of config.messages) {
    const mappedRole = template.body.roleMapping[msg.role] ?? msg.role
    messages.push({
      [template.body.roleField]: mappedRole,
      [template.body.contentField]: msg.content,
    })
  }

  bodyObj[template.body.messagesField] = messages

  return { url, headers, body: JSON.stringify(bodyObj) }
}

/** Shallow merge of source into target (mutates target) */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (
      typeof value === 'object' && value != null && !Array.isArray(value) &&
      typeof target[key] === 'object' && target[key] != null && !Array.isArray(target[key])
    ) {
      deepMerge(target[key] as Record<string, unknown>, value as Record<string, unknown>)
    } else {
      target[key] = value
    }
  }
}
