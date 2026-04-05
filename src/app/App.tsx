import { type ReactNode, useState, useEffect } from 'react'
import { OnboardingWizard } from '@/features/onboarding'
import { AppLayout } from './AppLayout'

export function App(): ReactNode {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)

  // Load showOnboarding from config on mount
  useEffect(() => {
    const api = (window as { consiliumAPI?: {
      configLoad(): Promise<{ values: Record<string, unknown> }>
      configSave(config: Record<string, unknown>): Promise<void>
    } }).consiliumAPI

    if (api == null) {
      setShowOnboarding(false)
      return
    }

    api.configLoad()
      .then((config) => {
        const value = config.values['showOnboarding']
        setShowOnboarding(typeof value === 'boolean' ? value : true)
      })
      .catch(() => setShowOnboarding(false))
  }, [])

  const handleComplete = () => {
    setShowOnboarding(false)

    // Persist showOnboarding = false for next startup
    const api = (window as { consiliumAPI?: {
      configLoad(): Promise<{ values: Record<string, unknown> }>
      configSave(config: Record<string, unknown>): Promise<void>
    } }).consiliumAPI

    if (api == null) return
    api.configLoad()
      .then((config) => api.configSave({ ...config.values, showOnboarding: false }))
      .catch(() => {})
  }

  // Loading config — show nothing briefly
  if (showOnboarding === null) return null

  if (showOnboarding) {
    return <OnboardingWizard onComplete={handleComplete} />
  }

  return <AppLayout />
}
