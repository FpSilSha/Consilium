import { type ReactNode, useState, useCallback, useRef, useEffect } from 'react'
import type { CustomAdapterDefinition } from '@/types'
import { useStore } from '@/store'
import { streamResponse } from '@/services/api/stream-orchestrator'
import { evictAdapterCache } from '@/services/api/stream-orchestrator'
import type { StreamCallbacks } from '@/services/api/stream-orchestrator'

interface TestConnectionPanelProps {
  readonly definition: CustomAdapterDefinition
}

interface TestResult {
  readonly status: 'idle' | 'running' | 'success' | 'error'
  readonly parsedChunks: readonly string[]
  readonly error?: string
}

export function TestConnectionPanel({ definition }: TestConnectionPanelProps): ReactNode {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [result, setResult] = useState<TestResult>({ status: 'idle', parsedChunks: [] })
  const controllerRef = useRef<AbortController | null>(null)

  // Cleanup on unmount — abort any in-flight test stream
  useEffect(() => {
    return () => { controllerRef.current?.abort() }
  }, [])

  const handleTest = useCallback(() => {
    const trimmedKey = apiKey.trim()
    const trimmedModel = model.trim()
    if (trimmedKey === '' || trimmedModel === '') return

    controllerRef.current?.abort()
    setResult({ status: 'running', parsedChunks: [] })

    // Temporarily register the definition so the orchestrator can find it
    useStore.getState().addCustomAdapter(definition)
    evictAdapterCache(definition.id)

    const callbacks: StreamCallbacks = {
      onChunk: (content) => {
        setResult((prev) => ({
          ...prev,
          parsedChunks: [...prev.parsedChunks, `[content] "${content}"`],
        }))
      },
      onDone: (fullContent, tokenUsage) => {
        const usageStr = tokenUsage != null
          ? ` (${tokenUsage.inputTokens} in, ${tokenUsage.outputTokens} out)`
          : ''
        setResult((prev) => ({
          status: 'success',
          parsedChunks: [...prev.parsedChunks, `[done] "${fullContent.slice(0, 50)}..."${usageStr}`],
        }))
      },
      onError: (error) => {
        setResult((prev) => ({
          status: 'error',
          parsedChunks: [...prev.parsedChunks, `[error] ${error}`],
          error,
        }))
      },
    }

    const controller = streamResponse(
      {
        provider: 'custom',
        model: trimmedModel,
        apiKey: trimmedKey,
        systemPrompt: 'Respond with exactly one word.',
        messages: [{ role: 'user', content: 'Say hello.' }],
        maxTokens: 10,
        adapterDefinitionId: definition.id,
      },
      callbacks,
    )

    controllerRef.current = controller
  }, [apiKey, model, definition])

  const handleStop = useCallback(() => {
    controllerRef.current?.abort()
    setResult((prev) => ({
      ...prev,
      status: prev.status === 'running' ? 'error' : prev.status,
      error: 'Cancelled',
    }))
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-medium text-content-muted">Test Connection</h3>
      <p className="text-[10px] text-content-disabled">
        Send a minimal test request to verify your adapter configuration works.
      </p>

      <div className="flex gap-2">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key for testing"
          className="flex-1 rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary placeholder-content-disabled outline-none focus:border-edge-focus"
        />
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Model ID"
          className="flex-1 rounded-md border border-edge-subtle bg-surface-base px-3 py-1.5 text-xs text-content-primary placeholder-content-disabled outline-none focus:border-edge-focus"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={result.status === 'running' || apiKey.trim() === '' || model.trim() === ''}
          className="rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-content-inverse transition-colors hover:bg-accent-blue/90 disabled:opacity-50"
        >
          {result.status === 'running' ? 'Testing...' : 'Test'}
        </button>
        {result.status === 'running' && (
          <button
            onClick={handleStop}
            className="rounded-md bg-surface-hover px-3 py-1.5 text-xs text-content-muted transition-colors hover:bg-surface-active"
          >
            Stop
          </button>
        )}
      </div>

      {result.parsedChunks.length > 0 && (
        <div className="rounded-md border border-edge-subtle bg-surface-base p-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[10px] font-medium text-content-muted">Parsed Output</span>
            {result.status === 'success' && <span className="text-[10px] text-success">Success</span>}
            {result.status === 'error' && <span className="text-[10px] text-error">Error</span>}
          </div>
          <div className="max-h-40 overflow-y-auto font-mono text-[10px] text-content-primary">
            {result.parsedChunks.map((line, i) => (
              <div key={i} className={line.startsWith('[error]') ? 'text-error' : line.startsWith('[done]') ? 'text-success' : ''}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
