import { type ReactNode, useState, useRef } from 'react'
import { OnboardingWizard } from '@/features/onboarding'
import { useStore } from '@/store'
import { AppLayout } from './AppLayout'

export function App(): ReactNode {
  const keysLoaded = useStore((s) => s.keysLoaded)
  const keyCount = useStore((s) => s.keys.length)
  const [onboardingComplete, setOnboardingComplete] = useState(false)

  // Track if the user has ever had keys — once they've entered the dashboard,
  // removing all keys should NOT kick them back to onboarding
  const hasEverHadKeys = useRef(false)
  if (keyCount > 0) hasEverHadKeys.current = true

  const FORCE_ONBOARDING = false

  const showOnboarding = FORCE_ONBOARDING || (
    keysLoaded && keyCount === 0 && !onboardingComplete && !hasEverHadKeys.current
  )

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />
  }

  return <AppLayout />
}
