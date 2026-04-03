/** Describes how to build the HTTP request to a custom provider */
export interface CustomRequestTemplate {
  /** Full URL (supports ${model} interpolation) */
  readonly url: string
  /** Whether ${model} in URL should be replaced with the model ID */
  readonly urlModelInterpolation: boolean
  /** Auth header name, e.g. "Authorization", "x-api-key" */
  readonly authHeaderName: string
  /** Prefix before the key value, e.g. "Bearer " or "" for bare key */
  readonly authHeaderValuePrefix: string
  /** Additional static headers */
  readonly extraHeaders: Readonly<Record<string, string>>
  /** Body structure configuration */
  readonly body: CustomBodyTemplate
}

/** Describes the JSON body structure for the API request */
export interface CustomBodyTemplate {
  /** Field name for the model ID, e.g. "model" */
  readonly modelField: string
  /** Field name for max tokens, e.g. "max_tokens" */
  readonly maxTokensField: string
  /** Field name for stream flag, e.g. "stream" */
  readonly streamField: string
  /** Value for stream flag — usually true */
  readonly streamValue: unknown
  /** Where the system prompt is placed */
  readonly systemPromptPlacement: 'top-level' | 'first-message' | 'nested'
  /** Dot-path for system prompt, e.g. "system" or "systemInstruction.parts[0].text" */
  readonly systemPromptPath: string
  /** Field name for the messages array, e.g. "messages", "contents" */
  readonly messagesField: string
  /** Field name for role in each message, e.g. "role" */
  readonly roleField: string
  /** Field name for content in each message, e.g. "content", "text" */
  readonly contentField: string
  /** Maps internal roles to provider roles, e.g. { user: "USER", assistant: "CHATBOT" } */
  readonly roleMapping: Readonly<Record<string, string>>
  /** Extra static fields to merge into the body */
  readonly extraFields: Readonly<Record<string, unknown>>
}

/** Describes how to parse the streaming response */
export interface CustomResponseTemplate {
  /** Stream format: SSE (data: lines) or NDJSON (one JSON per line) */
  readonly streamFormat: 'sse' | 'ndjson'
  /** Dot-path to content text, e.g. "choices[0].delta.content" */
  readonly contentPath: string
  /** Sentinel string that signals end-of-stream, e.g. "[DONE]" or null */
  readonly doneSentinel: string | null
  /** Dot-path to a field whose truthy value signals done, e.g. "choices[0].finish_reason" */
  readonly doneFieldPath: string | null
  /** Field name for event type routing (Anthropic-style), e.g. "type" */
  readonly eventTypeField: string | null
  /** Event type value for content events, e.g. "content_block_delta" */
  readonly contentEventType: string | null
  /** Event type value for done events, e.g. "message_delta" */
  readonly doneEventType: string | null
  /** Event type value for error events, e.g. "error" */
  readonly errorEventType: string | null
  /** Dot-path to error message, e.g. "error.message" */
  readonly errorMessagePath: string | null
  /** Dot-path to input token count, e.g. "usage.prompt_tokens" */
  readonly inputTokensPath: string | null
  /** Dot-path to output token count, e.g. "usage.completion_tokens" */
  readonly outputTokensPath: string | null
}

/** Full adapter definition — stored on disk and compiled at runtime */
export interface CustomAdapterDefinition {
  readonly id: string
  readonly name: string
  readonly request: CustomRequestTemplate
  readonly response: CustomResponseTemplate
  readonly createdAt: number
  readonly updatedAt: number
}
