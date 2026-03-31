import { type ReactNode, useState, useRef, useEffect, useCallback } from 'react'
import type { ModelInfo } from '@/types'

interface SearchableModelSelectProps {
  readonly models: readonly ModelInfo[]
  readonly value: string
  readonly onChange: (modelId: string) => void
  readonly disabled?: boolean
}

/**
 * Searchable model dropdown. Shows a text input that filters models
 * in a floating list. Handles keyboard navigation and click selection.
 */
export function SearchableModelSelect({
  models,
  value,
  onChange,
  disabled = false,
}: SearchableModelSelectProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selectedName = models.find((m) => m.id === value)?.name ?? value

  const filtered = search.trim() === ''
    ? models
    : models.filter((m) => {
        const q = search.toLowerCase()
        return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
      })

  const handleSelect = useCallback((modelId: string) => {
    onChange(modelId)
    setOpen(false)
    setSearch('')
  }, [onChange])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (!listRef.current?.contains(target) && !inputRef.current?.contains(target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // For small lists (<= 20), use a plain select
  if (models.length <= 20) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mb-2 w-full rounded-md border border-edge-subtle bg-surface-panel px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus disabled:opacity-50"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    )
  }

  return (
    <div className="relative mb-2">
      {/* Trigger / search input */}
      <input
        ref={inputRef}
        type="text"
        value={open ? search : selectedName}
        onChange={(e) => { setSearch(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => { setOpen(true); setSearch('') }}
        disabled={disabled}
        placeholder="Search models..."
        className="w-full rounded-md border border-edge-subtle bg-surface-panel px-2 py-1.5 text-xs text-content-primary outline-none focus:border-edge-focus disabled:opacity-50"
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setOpen(false); setSearch(''); inputRef.current?.blur() }
          if (e.key === 'Enter' && filtered.length > 0) { handleSelect(filtered[0]!.id) }
        }}
      />

      {/* Dropdown list */}
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-edge-subtle bg-surface-panel shadow-lg"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-content-disabled">No models match</div>
          ) : (
            filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => handleSelect(m.id)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover ${
                  m.id === value ? 'bg-surface-selected text-accent-blue' : 'text-content-primary'
                }`}
              >
                <span className="truncate">{m.name}</span>
                {m.outputPricePerToken > 0 && (
                  <span className="ml-2 shrink-0 text-[10px] text-content-disabled">
                    ${(m.outputPricePerToken * 1_000_000).toFixed(2)}/M
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
