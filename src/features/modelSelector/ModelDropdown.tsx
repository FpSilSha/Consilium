import type { ReactNode } from 'react'
import type { Provider } from '@/types'
import { getModelsForProvider } from './model-registry'

interface ModelDropdownProps {
  readonly provider: Provider
  readonly selectedModel: string
  readonly onSelect: (modelId: string) => void
}

export function ModelDropdown({ provider, selectedModel, onSelect }: ModelDropdownProps): ReactNode {
  const models = getModelsForProvider(provider)

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
