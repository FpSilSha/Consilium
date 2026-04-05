import type { CustomRequestTemplate, CustomResponseTemplate } from '@/types'

export interface AdapterWarning {
  readonly field: string
  readonly message: string
}

/**
 * Checks an adapter definition for likely misconfigurations.
 * Returns warnings — these are advisory, not blocking.
 */
export function getAdapterWarnings(
  name: string,
  request: CustomRequestTemplate,
  response: CustomResponseTemplate,
): readonly AdapterWarning[] {
  const warnings: AdapterWarning[] = []

  // Request warnings
  if (request.url !== '' && !/^https?:\/\//i.test(request.url)) {
    warnings.push({ field: 'URL', message: 'URL does not start with http:// or https://' })
  }

  if (request.authHeaderName === '') {
    warnings.push({ field: 'Auth Header', message: 'No auth header name — requests may fail to authenticate' })
  }

  if (request.body.modelField === '') {
    warnings.push({ field: 'Model Field', message: 'No model field — the provider won\'t know which model to use' })
  }

  if (request.body.messagesField === '') {
    warnings.push({ field: 'Messages Field', message: 'No messages field — the provider won\'t receive conversation history' })
  }

  // Response warnings
  if (response.streamFormat !== 'sse' && response.streamFormat !== 'ndjson') {
    warnings.push({ field: 'Stream Format', message: `"${response.streamFormat}" is not a recognized format (expected "sse" or "ndjson")` })
  }

  if (response.contentPath === '') {
    warnings.push({ field: 'Content Path', message: 'No content path — response content cannot be extracted' })
  }

  if (response.doneSentinel == null && response.doneFieldPath == null && response.doneEventType == null) {
    warnings.push({ field: 'Done Signal', message: 'No done sentinel, field path, or event type — stream may not terminate cleanly' })
  }

  return warnings
}
