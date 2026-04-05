import { type ReactNode, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { getCommands, type Command } from './command-registry'
import { fuzzyMatch } from './fuzzy-match'

interface CommandPaletteProps {
  readonly onClose: () => void
}

export function CommandPalette({ onClose }: CommandPaletteProps): ReactNode {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const available = getCommands().filter((c) => c.isAvailable())
    if (query.trim() === '') return available

    return available
      .map((cmd) => {
        const labelMatch = fuzzyMatch(query, cmd.label)
        const keywordScores = cmd.keywords.map((kw) => fuzzyMatch(query, kw))
        const bestKeyword = keywordScores.reduce(
          (best, m) => (m.score > best.score ? m : best),
          { match: false, score: 0 },
        )
        const match = labelMatch.match || bestKeyword.match
        const score = Math.max(labelMatch.score, bestKeyword.score)
        return { cmd, match, score }
      })
      .filter((r) => r.match)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.cmd)
  }, [query])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [filtered])

  const executeCommand = useCallback((cmd: Command) => {
    onClose()
    // Delay execution so the palette closes first
    requestAnimationFrame(() => cmd.execute())
  }, [onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[selectedIndex] != null) {
          executeCommand(filtered[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [filtered, selectedIndex, executeCommand, onClose])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[15vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-edge-subtle bg-surface-panel shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="border-b border-edge-subtle px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="w-full bg-transparent text-sm text-content-primary placeholder-content-disabled outline-none"
          />
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="px-4 py-3 text-xs text-content-disabled">No matching commands</p>
          )}
          {filtered.map((cmd, index) => (
            <button
              key={cmd.id}
              onClick={() => executeCommand(cmd)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`flex w-full items-center px-4 py-2 text-left text-sm transition-colors ${
                index === selectedIndex
                  ? 'bg-surface-hover text-content-primary'
                  : 'text-content-muted'
              }`}
            >
              {cmd.label}
            </button>
          ))}
        </div>

        {/* Hint */}
        <div className="border-t border-edge-subtle px-4 py-2 text-[10px] text-content-disabled">
          <span className="mr-3">↑↓ navigate</span>
          <span className="mr-3">↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
