import { type ReactNode, useState, useCallback } from 'react'
import { useStore } from '@/store'
import type { ModelMismatch } from './model-mismatch'
import { findClosestModel } from './closest-model'
import { useFilteredModels } from '@/features/modelCatalog/use-filtered-models'

type Resolution =
  | { readonly kind: 'pending' }
  | { readonly kind: 'replaced'; readonly model: string }
  | { readonly kind: 'reactivated' }

interface ModelMismatchModalProps {
  readonly mismatches: readonly ModelMismatch[]
  readonly onResolved: () => void
}

export function ModelMismatchModal({ mismatches, onResolved }: ModelMismatchModalProps): ReactNode {
  const updateWindow = useStore((s) => s.updateWindow)
  const setAllowedModels = useStore((s) => s.setAllowedModels)

  const [resolutions, setResolutions] = useState<Readonly<Record<string, Resolution>>>(() => {
    const initial: Record<string, Resolution> = {}
    for (const m of mismatches) {
      initial[m.windowId] = { kind: 'pending' }
    }
    return initial
  })

  const canApply = mismatches.every((m) => {
    const r = resolutions[m.windowId]
    return r != null && r.kind !== 'pending'
  })

  const handleReplacementChange = useCallback((windowId: string, modelId: string) => {
    setResolutions((prev) => ({ ...prev, [windowId]: { kind: 'replaced', model: modelId } }))
  }, [])

  const handleReactivate = useCallback((mismatch: ModelMismatch) => {
    const state = useStore.getState()
    const current = state.allowedModels[mismatch.provider] ?? []
    setAllowedModels(mismatch.provider, [...current, mismatch.currentModel])
    setResolutions((prev) => ({ ...prev, [mismatch.windowId]: { kind: 'reactivated' } }))
  }, [setAllowedModels])

  // Check if any provider's catalog is still loading
  const anyCatalogLoading = useStore((s) =>
    mismatches.some((m) => s.catalogStatus[m.provider] === 'loading'),
  )

  const handleSwitchAll = useCallback(() => {
    const state = useStore.getState()
    const updated: Record<string, Resolution> = {}

    for (const m of mismatches) {
      const allowed = state.allowedModels[m.provider] ?? []
      const catalogModels = state.catalogModels[m.provider] ?? []
      const available = allowed.length === 0 ? catalogModels : catalogModels.filter((cm) => allowed.includes(cm.id))
      const closest = findClosestModel(m.currentModel, available)
      updated[m.windowId] = closest != null
        ? { kind: 'replaced', model: closest }
        : { kind: 'pending' }
    }

    setResolutions((prev) => ({ ...prev, ...updated }))
  }, [mismatches])

  const handleApply = useCallback(() => {
    for (const m of mismatches) {
      const r = resolutions[m.windowId]
      if (r?.kind === 'replaced') {
        updateWindow(m.windowId, { model: r.model })
      }
      // 'reactivated' — already handled via setAllowedModels, no window update needed
    }
    onResolved()
  }, [mismatches, resolutions, updateWindow, onResolved])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mismatch-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="mx-4 w-full max-w-xl rounded-xl border border-edge-subtle bg-surface-panel p-6">
        <h2 id="mismatch-title" className="text-sm font-semibold text-content-primary">
          Some models aren't selected for use
        </h2>
        <p className="mt-1 text-xs text-content-muted">
          These advisors use models that are not in your allowed list.
          Switch them out or reactivate the selection.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {mismatches.map((m) => {
            const r = resolutions[m.windowId]
            return (
              <MismatchRow
                key={m.windowId}
                mismatch={m}
                resolution={r ?? { kind: 'pending' }}
                onReplacementChange={(modelId) => handleReplacementChange(m.windowId, modelId)}
                onReactivate={() => handleReactivate(m)}
              />
            )
          })}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={handleSwitchAll}
            disabled={anyCatalogLoading}
            className="rounded-md bg-surface-hover px-3 py-1.5 text-xs text-content-muted transition-colors hover:bg-surface-active disabled:opacity-50"
            title={anyCatalogLoading ? 'Waiting for model catalog to load...' : undefined}
          >
            {anyCatalogLoading ? 'Loading catalogs...' : 'Switch All (auto)'}
          </button>
          <button
            onClick={handleApply}
            disabled={!canApply}
            className="rounded-md bg-accent-blue px-4 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90 disabled:opacity-50"
          >
            Apply & Continue
          </button>
        </div>
      </div>
    </div>
  )
}

function MismatchRow({ mismatch, resolution, onReplacementChange, onReactivate }: {
  readonly mismatch: ModelMismatch
  readonly resolution: Resolution
  readonly onReplacementChange: (modelId: string) => void
  readonly onReactivate: () => void
}): ReactNode {
  const models = useFilteredModels(mismatch.provider)

  if (resolution.kind === 'reactivated') {
    return (
      <div className="flex items-center gap-3 rounded-md bg-success/10 px-3 py-2">
        <span className="text-xs text-content-primary">{mismatch.personaLabel}</span>
        <span className="text-[10px] text-success">Reactivated: {mismatch.currentModel}</span>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-edge-subtle bg-surface-base px-3 py-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-medium text-content-primary">{mismatch.personaLabel}</span>
          <span className="ml-2 text-[10px] text-content-disabled">{mismatch.provider}</span>
        </div>
        <button
          onClick={onReactivate}
          className="text-[10px] text-accent-blue transition-colors hover:text-accent-blue/80"
        >
          Reactivate
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-[10px] text-error line-through">{mismatch.currentModel}</span>
        <span className="text-[10px] text-content-disabled">→</span>
        {models.length > 0 ? (
          <select
            value={resolution.kind === 'replaced' ? resolution.model : ''}
            onChange={(e) => onReplacementChange(e.target.value)}
            className="flex-1 rounded-md border border-edge-subtle bg-surface-panel px-2 py-1 text-xs text-content-primary outline-none focus:border-edge-focus"
          >
            <option value="" disabled>Select replacement...</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={resolution.kind === 'replaced' ? resolution.model : ''}
            onChange={(e) => onReplacementChange(e.target.value)}
            placeholder="Enter model ID..."
            className="flex-1 rounded-md border border-edge-subtle bg-surface-panel px-2 py-1 text-xs text-content-primary outline-none focus:border-edge-focus"
          />
        )}
      </div>
    </div>
  )
}
