import { type ReactNode, useState } from 'react'
import type { Provider } from '@/types'
import { ProviderTab } from './ProviderTab'

const PROVIDERS: readonly { readonly value: Provider; readonly label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
  { value: 'xai', label: 'xAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openrouter', label: 'OpenRouter' },
]

interface ConfigModalProps {
  readonly onClose: () => void
}

export function ConfigModal({ onClose }: ConfigModalProps): ReactNode {
  const [activeTab, setActiveTab] = useState<Provider>('anthropic')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="config-modal-title"
        className="mx-4 flex h-[80vh] w-full max-w-4xl flex-col rounded-xl border border-edge-subtle bg-surface-panel"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge-subtle px-6 py-4">
          <h2 id="config-modal-title" className="text-sm font-semibold text-content-primary">
            Models & Keys
          </h2>
          <button
            onClick={onClose}
            autoFocus
            className="rounded-md px-2 py-1 text-xs text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
          >
            Close
          </button>
        </div>

        {/* Tab bar */}
        <div role="tablist" aria-label="Provider" className="flex gap-1 border-b border-edge-subtle px-6 pt-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              role="tab"
              id={`tab-${p.value}`}
              aria-selected={activeTab === p.value}
              aria-controls={`panel-${p.value}`}
              tabIndex={activeTab === p.value ? 0 : -1}
              onClick={() => setActiveTab(p.value)}
              className={`rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === p.value
                  ? 'border-b-2 border-accent-blue bg-surface-base text-accent-blue'
                  : 'text-content-muted hover:bg-surface-hover hover:text-content-primary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          className="flex-1 overflow-y-auto px-6 py-4"
        >
          <ProviderTab provider={activeTab} />
        </div>
      </div>
    </div>
  )
}
