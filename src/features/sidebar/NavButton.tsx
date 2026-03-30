import type { ReactNode } from 'react'

interface NavButtonProps {
  readonly icon: ReactNode
  readonly label: string
  readonly onClick: () => void
  readonly isActive?: boolean
  readonly disabled?: boolean
}

export function NavButton({
  icon,
  label,
  onClick,
  isActive = false,
  disabled = false,
}: NavButtonProps): ReactNode {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isActive}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        isActive
          ? 'bg-surface-selected text-accent-blue'
          : 'text-content-muted hover:bg-surface-hover hover:text-content-primary'
      } disabled:cursor-not-allowed disabled:text-content-disabled`}
    >
      <span className="flex h-5 w-5 items-center justify-center text-base">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}
