import { type ReactNode, useState } from 'react'
import { OnboardingWizard } from '@/features/onboarding'
import { useStore } from '@/store'
import { AppLayout } from './AppLayout'

export function App(): ReactNode {
  const keysLoaded = useStore((s) => s.keysLoaded)
  const keys = useStore((s) => s.keys)
  const [onboardingComplete, setOnboardingComplete] = useState(false)

  // Set to true to force-show onboarding wizard for testing
  const FORCE_ONBOARDING = false

  const showOnboarding = FORCE_ONBOARDING || (keysLoaded && keys.length === 0 && !onboardingComplete)

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />
  }

  return <AppLayout />
}
