import type { ReactNode } from 'react'
import type { CustomResponseTemplate } from '@/types'

interface ResponseConfigFormProps {
  readonly template: CustomResponseTemplate
  readonly onChange: (template: CustomResponseTemplate) => void
}

export function ResponseConfigForm({ template, onChange }: ResponseConfigFormProps): ReactNode {
  const update = (updates: Partial<CustomResponseTemplate>) => {
    onChange({ ...template, ...updates })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stream format */}
      <div>
        <label className="mb-1 block text-xs font-medium text-content-muted">Stream Format</label>
        <div className="flex gap-3">
          <label className="flex items-center gap-1.5 text-xs text-content-primary">
            <input
              type="radio"
              name="streamFormat"
              value="sse"
              checked={template.streamFormat === 'sse'}
              onChange={() => update({ streamFormat: 'sse' })}
              className="h-3 w-3"
            />
            SSE (data: lines)
          </label>
          <label className="flex items-center gap-1.5 text-xs text-content-primary">
            <input
              type="radio"
              name="streamFormat"
              value="ndjson"
              checked={template.streamFormat === 'ndjson'}
              onChange={() => update({ streamFormat: 'ndjson' })}
              className="h-3 w-3"
            />
            NDJSON (one JSON per line)
          </label>
        </div>
      </div>

      {/* Content extraction */}
      <div>
        <label className="mb-1 block text-xs font-medium text-content-muted">Content Extraction Path</label>
        <input
          type="text"
          value={template.contentPath}
          onChange={(e) => update({ contentPath: e.target.value })}
          placeholder='e.g. "choices[0].delta.content"'
          className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
        />
        <p className="mt-0.5 text-[10px] text-content-disabled">
          Dot-path to the text content in each streamed JSON event.
        </p>
      </div>

      {/* Done detection */}
      <div>
        <label className="mb-1 block text-xs font-medium text-content-muted">Done Detection</label>
        <div className="flex flex-col gap-2">
          <PathField
            label="Done sentinel"
            value={template.doneSentinel ?? ''}
            onChange={(v) => update({ doneSentinel: v || null })}
            placeholder='e.g. "[DONE]"'
            help="String that signals end of stream (before JSON parsing)."
          />
          <PathField
            label="Done field path"
            value={template.doneFieldPath ?? ''}
            onChange={(v) => update({ doneFieldPath: v || null })}
            placeholder='e.g. "choices[0].finish_reason"'
            help="Dot-path to a field whose truthy value signals done."
          />
        </div>
      </div>

      {/* Event type routing (advanced) */}
      <details className="rounded-md border border-edge-subtle bg-surface-base p-3">
        <summary className="cursor-pointer text-xs font-medium text-content-muted">
          Event Type Routing (Advanced)
        </summary>
        <p className="mt-1 mb-2 text-[10px] text-content-disabled">
          For APIs that use a type field to distinguish event kinds (e.g. Anthropic).
        </p>
        <div className="flex flex-col gap-2">
          <PathField label="Event type field" value={template.eventTypeField ?? ''} onChange={(v) => update({ eventTypeField: v || null })} placeholder='"type"' />
          <PathField label="Content event type" value={template.contentEventType ?? ''} onChange={(v) => update({ contentEventType: v || null })} placeholder='"content_block_delta"' />
          <PathField label="Done event type" value={template.doneEventType ?? ''} onChange={(v) => update({ doneEventType: v || null })} placeholder='"message_delta"' />
          <PathField label="Error event type" value={template.errorEventType ?? ''} onChange={(v) => update({ errorEventType: v || null })} placeholder='"error"' />
          <PathField label="Error message path" value={template.errorMessagePath ?? ''} onChange={(v) => update({ errorMessagePath: v || null })} placeholder='"error.message"' />
        </div>
      </details>

      {/* Token usage (advanced) */}
      <details className="rounded-md border border-edge-subtle bg-surface-base p-3">
        <summary className="cursor-pointer text-xs font-medium text-content-muted">
          Token Usage Paths (Advanced)
        </summary>
        <p className="mt-1 mb-2 text-[10px] text-content-disabled">
          Dot-paths to extract token counts from the response for cost tracking.
        </p>
        <div className="flex flex-col gap-2">
          <PathField label="Input tokens path" value={template.inputTokensPath ?? ''} onChange={(v) => update({ inputTokensPath: v || null })} placeholder='"usage.prompt_tokens"' />
          <PathField label="Output tokens path" value={template.outputTokensPath ?? ''} onChange={(v) => update({ outputTokensPath: v || null })} placeholder='"usage.completion_tokens"' />
        </div>
      </details>
    </div>
  )
}

function PathField({ label, value, onChange, placeholder, help }: {
  readonly label: string
  readonly value: string
  readonly onChange: (v: string) => void
  readonly placeholder?: string
  readonly help?: string
}): ReactNode {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] text-content-disabled">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-edge-subtle bg-surface-panel px-2 py-1 text-xs text-content-primary outline-none focus:border-edge-focus"
      />
      {help != null && <p className="mt-0.5 text-[10px] text-content-disabled">{help}</p>}
    </div>
  )
}
