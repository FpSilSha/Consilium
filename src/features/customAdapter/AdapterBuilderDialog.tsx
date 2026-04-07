import { type ReactNode, useState, useCallback, useMemo } from 'react'
import type { CustomAdapterDefinition, CustomRequestTemplate, CustomResponseTemplate } from '@/types'
import { useStore } from '@/store'
import { evictAdapterCache } from '@/services/api/stream-orchestrator'
import { PRESETS, type AdapterPreset } from './presets'
import { exportAdapterDefinition, importAdapterDefinition } from './adapter-io'
import { getAdapterWarnings } from './adapter-warnings'
import { RequestConfigForm } from './RequestConfigForm'
import { ResponseConfigForm } from './ResponseConfigForm'
import { TestConnectionPanel } from './TestConnectionPanel'

type Step = 'preset' | 'request' | 'response' | 'test'

interface AdapterBuilderDialogProps {
  /** Existing definition for edit mode, or null for new */
  readonly existing?: CustomAdapterDefinition | null
  readonly onSave: (def: CustomAdapterDefinition) => void
  readonly onClose: () => void
}

export function AdapterBuilderDialog({ existing, onSave, onClose }: AdapterBuilderDialogProps): ReactNode {
  const [step, setStep] = useState<Step>(existing != null ? 'request' : 'preset')
  const [name, setName] = useState(existing?.name ?? '')
  const [request, setRequest] = useState<CustomRequestTemplate>(
    existing?.request ?? PRESETS[0]!.request,
  )
  const [response, setResponse] = useState<CustomResponseTemplate>(
    existing?.response ?? PRESETS[0]!.response,
  )

  const handlePresetSelect = useCallback((preset: AdapterPreset) => {
    setRequest(preset.request)
    setResponse(preset.response)
    if (name === '') setName(preset.name)
    setStep('request')
  }, [name])

  const handleSave = useCallback(() => {
    const trimmedName = name.trim()
    if (trimmedName === '') return

    const id = (existing?.id != null && existing.id !== '')
      ? existing.id
      : trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (id === '') return

    const def: CustomAdapterDefinition = {
      id,
      name: trimmedName,
      request,
      response,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    }

    // Save to store + IPC
    const api = (window as { consiliumAPI?: { adaptersSave: (d: Record<string, unknown>) => Promise<void> } }).consiliumAPI
    api?.adaptersSave(def as unknown as Record<string, unknown>).catch(() => {})
    useStore.getState().addCustomAdapter(def)
    evictAdapterCache(def.id)

    onSave(def)
  }, [name, request, response, existing, onSave])

  const warnings = useMemo(() => getAdapterWarnings(name, request, response), [name, request, response])

  // Build a live definition for the test panel — memoized to avoid needless re-renders
  const liveDefinition = useMemo<CustomAdapterDefinition>(() => ({
    id: existing?.id ?? '__test-preview__',
    name: name || 'Test',
    request,
    response,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  }), [existing?.id, existing?.createdAt, name, request, response])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="mx-4 flex h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-edge-subtle bg-surface-panel"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge-subtle px-6 py-4">
          <h2 className="text-sm font-semibold text-content-primary">
            {existing != null ? 'Edit Adapter' : 'New Custom Adapter'}
          </h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-xs text-content-muted hover:bg-surface-hover">
            Cancel
          </button>
        </div>

        {/* Step tabs */}
        <div className="flex gap-1 border-b border-edge-subtle px-6 pt-2">
          {existing == null && (
            <StepTab label="Preset" active={step === 'preset'} onClick={() => setStep('preset')} />
          )}
          <StepTab label="Request" active={step === 'request'} onClick={() => setStep('request')} />
          <StepTab label="Response" active={step === 'response'} onClick={() => setStep('response')} />
          <StepTab label="Test" active={step === 'test'} onClick={() => setStep('test')} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === 'preset' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-content-muted">Choose a starting template:</p>
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset)}
                  className="rounded-md border border-edge-subtle bg-surface-base px-4 py-3 text-left transition-colors hover:border-accent-blue hover:bg-surface-hover"
                >
                  <div className="text-xs font-medium text-content-primary">{preset.name}</div>
                  <div className="mt-0.5 text-[10px] text-content-disabled">{preset.description}</div>
                </button>
              ))}
              <button
                onClick={() => setStep('request')}
                className="rounded-md border border-edge-subtle bg-surface-base px-4 py-3 text-left transition-colors hover:border-edge-focus"
              >
                <div className="text-xs font-medium text-content-muted">Start from scratch</div>
                <div className="mt-0.5 text-[10px] text-content-disabled">Configure everything manually.</div>
              </button>
            </div>
          )}

          {step === 'request' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-content-muted">Adapter Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Cohere Command R"
                  className="w-full rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus"
                />
              </div>
              <RequestConfigForm template={request} onChange={setRequest} />
            </div>
          )}

          {step === 'response' && (
            <ResponseConfigForm template={response} onChange={setResponse} />
          )}

          {step === 'test' && (
            <TestConnectionPanel definition={liveDefinition} />
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 border-t border-edge-subtle px-6 py-3">
          {/* Warnings */}
          {warnings.length > 0 && step !== 'preset' && (
            <div className="flex flex-col gap-1 rounded-md border border-yellow-700/50 bg-yellow-900/20 px-3 py-2">
              {warnings.map((w) => (
                <div key={w.field} className="flex items-start gap-1.5 text-[10px] text-yellow-400">
                  <span className="shrink-0">⚠</span>
                  <span><span className="font-medium">{w.field}:</span> {w.message}</span>
                </div>
              ))}
            </div>
          )}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {step !== 'preset' && step !== 'request' && (
              <button
                onClick={() => setStep(step === 'test' ? 'response' : step === 'response' ? 'request' : 'preset')}
                className="rounded-md bg-surface-hover px-3 py-1.5 text-xs text-content-muted hover:bg-surface-active"
              >
                Back
              </button>
            )}
            <button
              onClick={() => exportAdapterDefinition(liveDefinition)}
              className="rounded-md bg-surface-hover px-2 py-1.5 text-[10px] text-content-disabled hover:bg-surface-active hover:text-content-muted"
            >
              Export
            </button>
            <button
              onClick={async () => {
                const imported = await importAdapterDefinition()
                if (imported != null) {
                  setName(imported.name)
                  setRequest(imported.request)
                  setResponse(imported.response)
                  setStep('request')
                }
              }}
              className="rounded-md bg-surface-hover px-2 py-1.5 text-[10px] text-content-disabled hover:bg-surface-active hover:text-content-muted"
            >
              Import
            </button>
          </div>
          <div className="flex gap-2">
            {step !== 'test' && (
              <button
                onClick={() => setStep(step === 'request' ? 'response' : step === 'response' ? 'test' : 'request')}
                className="rounded-md bg-surface-hover px-3 py-1.5 text-xs text-content-muted hover:bg-surface-active"
              >
                Next
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={name.trim() === ''}
              className="rounded-md bg-accent-blue px-4 py-1.5 text-xs font-medium text-content-inverse hover:bg-accent-blue/90 disabled:opacity-50"
            >
              Save Adapter
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

function StepTab({ label, active, onClick }: {
  readonly label: string
  readonly active: boolean
  readonly onClick: () => void
}): ReactNode {
  return (
    <button
      onClick={onClick}
      className={`rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-b-2 border-accent-blue bg-surface-base text-accent-blue'
          : 'text-content-muted hover:bg-surface-hover hover:text-content-primary'
      }`}
    >
      {label}
    </button>
  )
}
