import { type ReactNode, useCallback } from 'react'
import type { CustomRequestTemplate, CustomBodyTemplate } from '@/types'

interface RequestConfigFormProps {
  readonly template: CustomRequestTemplate
  readonly onChange: (template: CustomRequestTemplate) => void
}

export function RequestConfigForm({ template, onChange }: RequestConfigFormProps): ReactNode {
  const updateBody = useCallback((updates: Partial<CustomBodyTemplate>) => {
    onChange({ ...template, body: { ...template.body, ...updates } })
  }, [template, onChange])

  const updateRoleMapping = useCallback((key: string, value: string) => {
    onChange({
      ...template,
      body: { ...template.body, roleMapping: { ...template.body.roleMapping, [key]: value } },
    })
  }, [template, onChange])

  return (
    <div className="flex flex-col gap-4">
      {/* Endpoint */}
      <div>
        <label className="mb-1 block text-xs font-medium text-content-muted">API Endpoint URL</label>
        <input
          type="url"
          value={template.url}
          onChange={(e) => onChange({ ...template, url: e.target.value })}
          placeholder="https://api.example.com/v1/chat/completions"
          className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
        />
        <label className="mt-1 flex items-center gap-1.5 text-[10px] text-content-disabled">
          <input
            type="checkbox"
            checked={template.urlModelInterpolation}
            onChange={(e) => onChange({ ...template, urlModelInterpolation: e.target.checked })}
            className="h-3 w-3"
          />
          Replace {'${model}'} in URL with the model ID
        </label>
      </div>

      {/* Authentication */}
      <div>
        <label className="mb-1 block text-xs font-medium text-content-muted">Authentication</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={template.authHeaderName}
            onChange={(e) => onChange({ ...template, authHeaderName: e.target.value })}
            placeholder="Authorization"
            className="flex-1 rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
          />
          <input
            type="text"
            value={template.authHeaderValuePrefix}
            onChange={(e) => onChange({ ...template, authHeaderValuePrefix: e.target.value })}
            placeholder="Bearer "
            className="w-24 rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
          />
        </div>
        <p className="mt-0.5 text-[10px] text-content-disabled">
          Header name and prefix before the API key value.
        </p>
      </div>

      {/* Body field names */}
      <div>
        <label className="mb-1 block text-xs font-medium text-content-muted">Body Field Names</label>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Model field" value={template.body.modelField} onChange={(v) => updateBody({ modelField: v })} />
          <Field label="Max tokens field" value={template.body.maxTokensField} onChange={(v) => updateBody({ maxTokensField: v })} />
          <Field label="Stream field" value={template.body.streamField} onChange={(v) => updateBody({ streamField: v })} />
          <Field label="Messages field" value={template.body.messagesField} onChange={(v) => updateBody({ messagesField: v })} />
        </div>
      </div>

      {/* System prompt */}
      <div>
        <label className="mb-1 block text-xs font-medium text-content-muted">System Prompt Placement</label>
        <select
          value={template.body.systemPromptPlacement}
          onChange={(e) => updateBody({ systemPromptPlacement: e.target.value as 'top-level' | 'first-message' | 'nested' })}
          className="mb-1 w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
        >
          <option value="first-message">As first message (OpenAI-style)</option>
          <option value="top-level">Top-level field (Anthropic-style)</option>
          <option value="nested">Nested path (Google-style)</option>
        </select>
        {template.body.systemPromptPlacement !== 'first-message' && (
          <Field
            label="System prompt path"
            value={template.body.systemPromptPath}
            onChange={(v) => updateBody({ systemPromptPath: v })}
            placeholder='e.g. "system" or "systemInstruction.parts[0].text"'
          />
        )}
      </div>

      {/* Message format */}
      <div>
        <label className="mb-1 block text-xs font-medium text-content-muted">Message Format</label>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Role field" value={template.body.roleField} onChange={(v) => updateBody({ roleField: v })} />
          <Field label="Content field" value={template.body.contentField} onChange={(v) => updateBody({ contentField: v })} />
        </div>
      </div>

      {/* Role mapping */}
      <div>
        <label className="mb-1 block text-xs font-medium text-content-muted">Role Mapping</label>
        <p className="mb-1 text-[10px] text-content-disabled">
          Map internal roles to this provider's role names.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <RoleMap label="user →" value={template.body.roleMapping['user'] ?? 'user'} onChange={(v) => updateRoleMapping('user', v)} />
          <RoleMap label="assistant →" value={template.body.roleMapping['assistant'] ?? 'assistant'} onChange={(v) => updateRoleMapping('assistant', v)} />
          <RoleMap label="system →" value={template.body.roleMapping['system'] ?? 'system'} onChange={(v) => updateRoleMapping('system', v)} />
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  readonly label: string
  readonly value: string
  readonly onChange: (v: string) => void
  readonly placeholder?: string
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
    </div>
  )
}

function RoleMap({ label, value, onChange }: {
  readonly label: string
  readonly value: string
  readonly onChange: (v: string) => void
}): ReactNode {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] text-content-disabled">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-edge-subtle bg-surface-panel px-2 py-1 text-xs text-content-primary outline-none focus:border-edge-focus"
      />
    </div>
  )
}
