import { type ReactNode, useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

const SHOW_DELAY_MS = 600
const FADE_DURATION_MS = 150

interface TooltipProps {
  readonly children: ReactNode
  readonly text: string
  readonly position?: TooltipPosition
}

interface Coords {
  readonly top: number
  readonly left: number
}

function computeCoords(triggerRect: DOMRect, tooltipRect: DOMRect, position: TooltipPosition): Coords {
  const gap = 6

  switch (position) {
    case 'top':
      return { top: triggerRect.top - tooltipRect.height - gap, left: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2 }
    case 'bottom':
      return { top: triggerRect.bottom + gap, left: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2 }
    case 'left':
      return { top: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2, left: triggerRect.left - tooltipRect.width - gap }
    case 'right':
      return { top: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2, left: triggerRect.right + gap }
  }
}

function clampToViewport(coords: Coords, tooltipRect: DOMRect): Coords {
  const pad = 4
  return {
    top: Math.max(pad, Math.min(coords.top, window.innerHeight - tooltipRect.height - pad)),
    left: Math.max(pad, Math.min(coords.left, window.innerWidth - tooltipRect.width - pad)),
  }
}

export function Tooltip({ children, text, position = 'top' }: TooltipProps): ReactNode {
  const [mounted, setMounted] = useState(false)
  const [opacity, setOpacity] = useState(0)
  const [coords, setCoords] = useState<Coords>({ top: -9999, left: -9999 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tooltipCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (node == null || triggerRef.current == null) return
    const triggerRect = triggerRef.current.getBoundingClientRect()
    const tooltipRect = node.getBoundingClientRect()
    const raw = computeCoords(triggerRect, tooltipRect, position)
    setCoords(clampToViewport(raw, tooltipRect))
  }, [position])

  const show = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    showTimerRef.current = setTimeout(() => {
      setMounted(true)
      // Fade in on next frame after mount
      requestAnimationFrame(() => setOpacity(1))
    }, SHOW_DELAY_MS)
  }, [])

  const hide = useCallback(() => {
    if (showTimerRef.current != null) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
    setOpacity(0)
    hideTimerRef.current = setTimeout(() => {
      setMounted(false)
      setCoords({ top: -9999, left: -9999 })
    }, FADE_DURATION_MS)
  }, [])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (showTimerRef.current != null) clearTimeout(showTimerRef.current)
      if (hideTimerRef.current != null) clearTimeout(hideTimerRef.current)
    }
  }, [])

  return (
    <>
      <div
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children}
      </div>
      {mounted && createPortal(
        <div
          ref={tooltipCallbackRef}
          className="pointer-events-none fixed z-[9999] w-max max-w-48 rounded border border-edge-subtle bg-surface-base px-2 py-1 text-xs text-content-primary shadow-lg"
          style={{
            top: coords.top,
            left: coords.left,
            opacity,
            transition: `opacity ${FADE_DURATION_MS}ms ease-in-out`,
          }}
          role="tooltip"
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  )
}
