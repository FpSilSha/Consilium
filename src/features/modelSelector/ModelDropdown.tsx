import { type ReactNode, useEffect, useState } from 'react'
import type { Provider } from '@/types'
import { useStore } from '@/store'
import { getModelsForProvider } from './model-registry'
import { fetchOpenRouterModels } from './openrouter-models'
import { getRawKey } from '@/features/keys/key-vault'

interface ModelDropdownProps {
  readonly provider: Provider
  readonly keyId: string
  readonly selectedModel: string
  readonly onSelect: (modelId: string) => void
}

export function ModelDropdown({ provider, keyId, selectedModel, onSelect }: ModelDropdownProps): ReactNode {
  const openRouterModels = useStore((s) => s.catalogModels['openrouter']) ?? []
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (provider !== 'openrouter') return
    if (openRouterModels.length > 0) return

    const rawKey = getRawKey(keyId)
    if (rawKey == null) return

    let cancelled = false
    setLoading(true)
    fetchOpenRouterModels(rawKey)
      .then(() => { if (!cancelled) setLoading(false) })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [provider, keyId, openRouterModels.length])

  const models = provider === 'openrouter' ? openRouterModels : getModelsForProvider(provider)

  if (loading) {
    return (
      <select
        disabled
        className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-500 outline-none"
      >
        <option>Loading models...</option>
      </select>
    )
  }

  if (models.length === 0 && provider === 'openrouter') {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={selectedModel}
          onChange={(e) => onSelect(e.target.value)}
          placeholder="e.g. anthropic/claude-sonnet-4"
          className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 outline-none focus:border-gray-500"
        />
      </div>
    )
  }

  return (
    <select
      value={selectedModel}
      onChange={(e) => onSelect(e.target.value)}
      className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300 outline-none focus:border-gray-500"
    >
      {models.map((model) => (
        <option key={model.id} value={model.id}>
          {model.name}
        </option>
      ))}
    </select>
  )
}
