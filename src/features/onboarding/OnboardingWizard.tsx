import { type ReactNode, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { createApiKeyEntry } from '@/features/keys/key-storage'
import { storeRawKey } from '@/features/keys/key-vault'
import { detectProvider } from '@/features/keys/key-detection'
import { getModelsForProvider, getAllModels } from '@/features/modelSelector/model-registry'

type WizardStep = 'welcome' | 'api-key' | 'model' | 'persona' | 'tour' | 'done'

interface OnboardingWizardProps {
  readonly onComplete: () => void
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps): ReactNode {
  const [step, setStep] = useState<WizardStep>('welcome')
  const [keyInput, setKeyInput] = useState('')
  const [keyError, setKeyError] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const addKey = useStore((s) => s.addKey)
  const personas = useStore((s) => s.personas)

  const handleAddKey = useCallback(() => {
    const trimmed = keyInput.trim()
    if (trimmed === '') {
      setKeyError('Please enter an API key')
      return
    }

    const detected = detectProvider(trimmed)
    if (detected === null) {
      setKeyError('Could not detect provider. Supported: Anthropic (sk-ant-), OpenAI (sk-proj-), Google (AIza), xAI (xai-), DeepSeek (sk-)')
      return
    }

    const entry = createApiKeyEntry(trimmed)
    if (entry === null) {
      setKeyError('Invalid API key format')
      return
    }

    addKey(entry)
    storeRawKey(entry.id, trimmed)

    // Pre-select a model from this provider
    const models = getModelsForProvider(detected.provider)
    if (models.length > 0) {
      setSelectedModel(models[0]!.id)
    }

    setKeyError('')
    setStep('model')
  }, [keyInput, addKey])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-8">
        {step === 'welcome' && (
          <div className="text-center">
            <h1 className="mb-2 text-xl font-semibold text-gray-100">Welcome to Consilium</h1>
            <p className="mb-6 text-sm text-gray-400">
              Your multi-agent AI advisory board. Lead a panel of AI advisors,
              each with its own model, provider, and persona.
            </p>
            <button
              onClick={() => setStep('api-key')}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              Get Started
            </button>
          </div>
        )}

        {step === 'api-key' && (
          <div>
            <h2 className="mb-1 text-lg font-medium text-gray-100">Add an API Key</h2>
            <p className="mb-4 text-xs text-gray-400">
              Paste any supported provider key. We&apos;ll auto-detect the provider.
            </p>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => { setKeyInput(e.target.value); setKeyError('') }}
              placeholder="sk-ant-..., sk-proj-..., AIza..., xai-..."
              className="mb-2 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 outline-none focus:border-gray-500"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddKey()}
            />
            {keyError !== '' && (
              <p className="mb-2 text-xs text-red-400">{keyError}</p>
            )}
            <div className="mb-4 rounded border border-gray-800 bg-gray-950 p-3 text-xs text-gray-500">
              You are responsible for your own API keys and must comply with each
              provider&apos;s Terms of Service. This application does not store, proxy,
              or redistribute your API access.
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setStep('welcome')}
                className="rounded px-4 py-2 text-xs text-gray-400 hover:bg-gray-800"
              >
                Back
              </button>
              <button
                onClick={handleAddKey}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                Add Key
              </button>
            </div>
          </div>
        )}

        {step === 'model' && (
          <div>
            <h2 className="mb-1 text-lg font-medium text-gray-100">Select a Model</h2>
            <p className="mb-4 text-xs text-gray-400">
              Choose a default model for your first advisor.
            </p>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="mb-6 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 outline-none focus:border-gray-500"
            >
              {getAllModels().map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider})
                </option>
              ))}
            </select>
            <div className="flex justify-between">
              <button
                onClick={() => setStep('api-key')}
                className="rounded px-4 py-2 text-xs text-gray-400 hover:bg-gray-800"
              >
                Back
              </button>
              <button
                onClick={() => setStep('persona')}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'persona' && (
          <div>
            <h2 className="mb-1 text-lg font-medium text-gray-100">Choose a Persona</h2>
            <p className="mb-4 text-xs text-gray-400">
              Personas define each advisor&apos;s role and expertise. Select a default
              or use your own .md files later.
            </p>
            <div className="mb-6 grid grid-cols-2 gap-2">
              {personas.map((p) => (
                <div
                  key={p.id}
                  className="rounded border border-gray-700 bg-gray-800 px-3 py-2"
                >
                  <span className="text-xs font-medium text-gray-300">{p.name}</span>
                </div>
              ))}
              {personas.length === 0 && (
                <p className="col-span-2 text-xs text-gray-500">
                  No personas found. Default advisor persona will be used.
                </p>
              )}
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setStep('model')}
                className="rounded px-4 py-2 text-xs text-gray-400 hover:bg-gray-800"
              >
                Back
              </button>
              <button
                onClick={() => setStep('tour')}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'tour' && (
          <div>
            <h2 className="mb-4 text-lg font-medium text-gray-100">Quick Tour</h2>
            <div className="mb-6 space-y-3 text-xs text-gray-400">
              <div className="flex gap-3">
                <span className="shrink-0 text-blue-400">1.</span>
                <span><strong className="text-gray-300">Shared Context</strong> — All advisors see the same conversation. Every message is part of a shared thread.</span>
              </div>
              <div className="flex gap-3">
                <span className="shrink-0 text-blue-400">2.</span>
                <span><strong className="text-gray-300">Turn Modes</strong> — Sequential (round-robin), Parallel (all at once), Manual (you choose), or Queue (custom order).</span>
              </div>
              <div className="flex gap-3">
                <span className="shrink-0 text-blue-400">3.</span>
                <span><strong className="text-gray-300">@Mentions</strong> — Type @AgentName to direct a question to a specific advisor.</span>
              </div>
              <div className="flex gap-3">
                <span className="shrink-0 text-blue-400">4.</span>
                <span><strong className="text-gray-300">Personas</strong> — Each advisor has a role defined by a .md file in the personas folder.</span>
              </div>
              <div className="flex gap-3">
                <span className="shrink-0 text-blue-400">5.</span>
                <span><strong className="text-gray-300">Voting</strong> — Use "Call for Vote" to get YAY/NAY/ABSTAIN from all advisors on any question.</span>
              </div>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setStep('persona')}
                className="rounded px-4 py-2 text-xs text-gray-400 hover:bg-gray-800"
              >
                Back
              </button>
              <button
                onClick={onComplete}
                className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-500"
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
