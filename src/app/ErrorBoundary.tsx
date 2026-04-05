import { Component, type ReactNode, type ErrorInfo } from 'react'
import { redactKeys } from '@/features/keys'

interface Props {
  readonly children: ReactNode
}

interface State {
  readonly hasError: boolean
  readonly error: string | null
}

/**
 * Catches unhandled React render errors and displays a recovery UI
 * instead of a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? redactKeys(error.message) : 'Unknown error'
    return { hasError: true, error: message }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-surface-base p-8">
          <h1 className="text-lg font-semibold text-content-primary">Something went wrong</h1>
          <p className="max-w-md text-center text-sm text-content-muted">
            {this.state.error}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-accent-blue/90"
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
