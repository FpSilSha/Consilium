import { type ReactNode, useState, useCallback, useRef, useEffect } from 'react'
import { useStore } from '@/store'
import { createApiKeyEntry } from '@/features/keys/key-storage'
import { storeRawKey } from '@/features/keys/key-vault'
import { detectProvider } from '@/features/keys/key-detection'
import { validateKey } from '@/features/keys/key-validation'
import { getAllModels, getModelsForProvider } from '@/features/modelSelector/model-registry'
import { fetchOpenRouterModels } from '@/features/modelSelector/openrouter-models'
import { createAgentCard } from '@/features/turnManager'
import { createDefaultAdvisorWindow } from '@/features/windows/advisor-factory'
import { ModelTile } from './ModelTile'
import { PersonaTile } from './PersonaTile'

const TOUR_ITEMS = [
  { num: 1, title: 'Shared Context', desc: 'All advisors see the same conversation. Every message is part of a shared thread.' },
  { num: 2, title: 'Turn Modes', desc: 'Sequential (round-robin), Parallel (all at once), Manual (you choose), or Queue (custom order).' },
  { num: 3, title: '@Mentions', desc: 'Type @AgentName to direct a question to a specific advisor.' },
  { num: 4, title: 'Personas', desc: 'Each advisor has a role defined by a .md file in the personas folder.' },
  { num: 5, title: 'Voting', desc: 'Use "Call for Vote" to get YAY/NAY/ABSTAIN from all advisors on any question.' },
] as const

type WizardStep = 'welcome' | 'api-key' | 'configure' | 'tour'

interface OnboardingWizardProps {
  readonly onComplete: () => void
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps): ReactNode {
  const [step, setStep] = useState<WizardStep>('welcome')
  const [keyInput, setKeyInput] = useState('')
  const [keyError, setKeyError] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [showCustomUrl, setShowCustomUrl] = useState(false)
  const [validating, setValidating] = useState(false)
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null)

  const keys = useStore((s) => s.keys)
  const openRouterModels = useStore((s) => s.catalogModels['openrouter']) ?? []
  const addKey = useStore((s) => s.addKey)
  const addWindow = useStore((s) => s.addWindow)
  const addToQueue = useStore((s) => s.addToQueue)
  const personas = useStore((s) => s.personas)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const handleAddKey = useCallback(async () => {
    const trimmed = keyInput.trim()
    if (trimmed === '') {
      setKeyError('Please enter an API key')
      return
    }

    const detected = detectProvider(trimmed)

    if (detected === null && !showCustomUrl) {
      setShowCustomUrl(true)
      setKeyError('Unknown key format. Enter the provider\u2019s base URL below.')
      return
    }

    if (detected === null && showCustomUrl) {
      const urlTrimmed = customUrl.trim()
      if (urlTrimmed === '') {
        setKeyError('Please enter a base URL (e.g. https://api.example.com/v1)')
        return
      }
      try {
        const parsed = new URL(urlTrimmed)
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          setKeyError('URL must use http or https')
          return
        }
      } catch {
        setKeyError('Invalid URL format')
        return
      }
    }

    const provider = detected?.provider ?? 'custom'
    const entry = createApiKeyEntry(trimmed, provider)
    if (entry === null) {
      setKeyError('Invalid API key format')
      return
    }

    const baseUrl = detected === null ? customUrl.trim() : undefined
    const entryWithUrl = baseUrl !== undefined ? { ...entry, baseUrl } : entry

    let verified = false
    if (detected !== null) {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setValidating(true)
      setKeyError('')
      const result = await validateKey(trimmed, detected.provider, controller.signal)
      setValidating(false)

      if (controller.signal.aborted) return

      if (!result.valid && result.reason === 'auth_failure') {
        setKeyError('This API key is invalid or revoked. Please check and try again.')
        return
      }

      if (!result.valid && result.reason === 'cancelled') return
      verified = result.valid
    }

    const verifiedEntry = { ...entryWithUrl, verified }

    try {
      const metadata = verifiedEntry.baseUrl != null
        ? { provider: verifiedEntry.provider, baseUrl: verifiedEntry.baseUrl }
        : { provider: verifiedEntry.provider }
      await window.consiliumAPI?.keysSave(verifiedEntry.id, trimmed, metadata)
    } catch {
      // Non-fatal
    }

    addKey(verifiedEntry)
    storeRawKey(verifiedEntry.id, trimmed)

    if (detected !== null) {
      if (detected.provider === 'openrouter') {
        const signal = abortRef.current?.signal
        fetchOpenRouterModels(trimmed).then((models) => {
          if (signal?.aborted) return
          if (models.length > 0) setSelectedModel(models[0]!.id)
        }).catch(() => {})
      } else {
        const models = getModelsForProvider(detected.provider)
        if (models.length > 0) setSelectedModel(models[0]!.id)
      }
    }

    setKeyError('')
    setShowCustomUrl(false)
    setCustomUrl('')
    setStep('configure')
  }, [keyInput, addKey, showCustomUrl, customUrl])

  const windowOrder = useStore((s) => s.windowOrder)

  const handleFinish = useCallback(() => {
    const persona = selectedPersonaId !== null
      ? personas.find((p) => p.id === selectedPersonaId)
      : personas[0]

    const base = createDefaultAdvisorWindow(windowOrder, personas, keys)
    const newWindow = {
      ...base,
      ...(selectedModel !== '' ? { model: selectedModel } : {}),
      ...(persona != null ? { personaId: persona.id, personaLabel: persona.name } : {}),
    }

    addWindow(newWindow)
    addToQueue(createAgentCard(newWindow.id))
    onComplete()
  }, [windowOrder, keys, selectedModel, selectedPersonaId, personas, addWindow, addToQueue, onComplete])

  const allModels = getAllModels(openRouterModels)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-base">
      <div className="mx-4 w-full max-w-2xl rounded-xl border border-edge-subtle bg-surface-panel p-8">

        {/* ── Welcome ─────────────────────────────── */}
        {step === 'welcome' && (
          <div className="text-center">
            <h1 className="mb-2 text-xl font-semibold text-content-primary">
              Welcome to Consilium
            </h1>
            <p className="mb-6 text-sm text-content-muted">
              Your multi-agent AI advisory board. Lead a panel of AI advisors,
              each with its own model, provider, and persona.
            </p>
            <button
              onClick={() => setStep('api-key')}
              className="rounded-lg bg-accent-blue px-6 py-2.5 text-sm font-medium text-content-inverse transition-colors hover:bg-accent-blue/90"
            >
              Get Started
            </button>
          </div>
        )}

        {/* ── API Key ─────────────────────────────── */}
        {step === 'api-key' && (
          <div>
            <h2 className="mb-1 text-lg font-medium text-content-primary">Add an API Key</h2>
            <p className="mb-4 text-xs text-content-muted">
              Paste any supported provider key. We&apos;ll auto-detect the provider.
            </p>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value)
                setKeyError('')
                setShowCustomUrl(false)
                setCustomUrl('')
              }}
              placeholder="sk-ant-..., sk-proj-..., sk-or-..., AIza..., xai-..."
              className="mb-2 w-full rounded-lg border border-edge-subtle bg-surface-base px-3 py-2 text-sm text-content-primary placeholder-content-disabled outline-none focus:border-edge-focus"
              autoFocus
              disabled={validating}
              onKeyDown={(e) => e.key === 'Enter' && !showCustomUrl && handleAddKey()}
            />
            {keyError !== '' && (
              <p className={`mb-2 text-xs ${showCustomUrl ? 'text-content-muted' : 'text-error'}`}>
                {keyError}
              </p>
            )}
            {showCustomUrl && (
              <div className="mb-2">
                <label className="mb-1 block text-xs text-content-muted">
                  Provider Base URL
                </label>
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => { setCustomUrl(e.target.value); setKeyError('') }}
                  placeholder="https://api.example.com/v1"
                  className="w-full rounded-lg border border-edge-subtle bg-surface-base px-3 py-2 text-sm text-content-primary placeholder-content-disabled outline-none focus:border-edge-focus"
                  disabled={validating}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddKey()}
                />
              </div>
            )}
            <div className="mb-4 rounded-lg border border-edge-subtle bg-surface-base p-3 text-xs text-content-disabled">
              You are responsible for your own API keys and must comply with each
              provider&apos;s Terms of Service.
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={() => { setStep('welcome'); setShowCustomUrl(false); setCustomUrl(''); setKeyError('') }}
                className="rounded-lg px-4 py-2 text-xs text-content-muted transition-colors hover:bg-surface-hover"
              >
                Back
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => { setStep('configure'); setShowCustomUrl(false); setCustomUrl(''); setKeyError('') }}
                  className="rounded-lg px-4 py-2 text-xs text-content-disabled transition-colors hover:bg-surface-hover hover:text-content-muted"
                >
                  Skip
                </button>
                <button
                  onClick={handleAddKey}
                  className="rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-accent-blue/90 disabled:opacity-50"
                  disabled={validating}
                >
                  {validating ? 'Validating...' : showCustomUrl ? 'Add Custom Key' : 'Add Key'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Configure Advisor (Model + Persona grid) ── */}
        {step === 'configure' && (
          <div>
            <h2 className="mb-1 text-lg font-medium text-content-primary">
              Configure your first Advisor
            </h2>
            <p className="mb-4 text-xs text-content-muted">
              Choose a model and persona to define your advisor&apos;s capabilities.
            </p>

            {/* Model Selection */}
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-content-muted">
              Model Selection
            </h3>
            <div className="mb-5 max-h-48 overflow-y-auto rounded-lg border border-edge-subtle p-2">
              <div className="grid grid-cols-3 gap-2">
                {allModels.map((m) => (
                  <ModelTile
                    key={m.id}
                    model={m}
                    isSelected={selectedModel === m.id}
                    onClick={() => setSelectedModel(m.id)}
                  />
                ))}
              </div>
            </div>

            {/* Persona Configuration */}
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-content-muted">
              Persona Configuration
            </h3>
            <div className="mb-5 grid grid-cols-2 gap-2">
              {personas.map((p) => (
                <PersonaTile
                  key={p.id}
                  persona={p}
                  isSelected={selectedPersonaId === p.id}
                  onClick={() => setSelectedPersonaId(p.id)}
                />
              ))}
              {personas.length === 0 && (
                <p className="col-span-2 text-xs text-content-disabled">
                  No personas found. Default advisor persona will be used.
                </p>
              )}
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep('api-key')}
                className="rounded-lg px-4 py-2 text-xs text-content-muted transition-colors hover:bg-surface-hover"
              >
                Back
              </button>
              <button
                onClick={() => setStep('tour')}
                className="rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-accent-blue/90"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* ── Quick Tour ──────────────────────────── */}
        {step === 'tour' && (
          <div>
            <h2 className="mb-4 text-lg font-medium text-content-primary">Quick Tour</h2>
            {keys.length === 0 && (
              <p className="mb-4 rounded-lg border border-edge-subtle bg-surface-base px-3 py-2 text-xs text-error">
                No API key added. Add one later via the Keys panel before sending messages.
              </p>
            )}
            <div className="mb-6 space-y-3 text-xs text-content-muted">
              {TOUR_ITEMS.map((item) => (
                <div key={item.num} className="flex gap-3">
                  <span className="shrink-0 text-accent-blue">{item.num}.</span>
                  <span>
                    <strong className="text-content-primary">{item.title}</strong>
                    {' — '}{item.desc}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setStep('configure')}
                className="rounded-lg px-4 py-2 text-xs text-content-muted transition-colors hover:bg-surface-hover"
              >
                Back
              </button>
              <button
                onClick={handleFinish}
                className="rounded-lg bg-accent-green px-6 py-2.5 text-sm font-medium text-content-inverse transition-colors hover:bg-accent-green/90"
              >
                Start Using Consilium
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
