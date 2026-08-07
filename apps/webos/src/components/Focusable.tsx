import {
  useEffect,
  useRef,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  directionFromKey,
  isSelectKey,
  moveFocus,
  syncScrollToFocus,
  type NavDirection,
} from '../navigation/spatialNav'

interface FocusableProps {
  id?: string
  className?: string
  children?: ReactNode
  onSelect?: () => void
  onFocus?: () => void
  /** Return true to consume the arrow (e.g. scrubber seek) instead of moving focus. */
  onArrowKey?: (direction: NavDirection) => boolean
  disabled?: boolean
  role?: string
  tabIndex?: number
  autoFocus?: boolean
  as?: 'button' | 'div'
  /** Prefer focusing this when entering a screen with the remote */
  dataNavZone?: string
  'aria-label'?: string
}

export function Focusable({
  id,
  className = '',
  children,
  onSelect,
  onFocus,
  onArrowKey,
  disabled,
  role = 'button',
  tabIndex = 0,
  autoFocus,
  as = 'div',
  dataNavZone,
  'aria-label': ariaLabel,
}: FocusableProps) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (autoFocus && ref.current) {
      const t = window.setTimeout(() => {
        ref.current?.focus({ preventScroll: true })
        if (ref.current) syncScrollToFocus(ref.current)
      }, 30)
      return () => window.clearTimeout(t)
    }
  }, [autoFocus])

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (disabled) return

    const direction = directionFromKey(e.nativeEvent)
    if (direction) {
      if (onArrowKey?.(direction)) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      e.preventDefault()
      e.stopPropagation()
      moveFocus(direction)
      return
    }

    if (isSelectKey(e.nativeEvent)) {
      e.preventDefault()
      onSelect?.()
    }
  }

  const props = {
    id,
    ref: ref as RefObject<HTMLDivElement & HTMLButtonElement>,
    className: `focusable ${className}`.trim(),
    tabIndex: disabled ? -1 : tabIndex,
    role,
    'aria-disabled': disabled || undefined,
    'aria-label': ariaLabel,
    'data-nav-zone': dataNavZone,
    onKeyDown,
    onClick: () => {
      if (!disabled) onSelect?.()
    },
    onFocus: (_e: FocusEvent) => {
      if (ref.current) syncScrollToFocus(ref.current)
      onFocus?.()
    },
  }

  if (as === 'button') {
    return (
      <button type="button" {...props} disabled={disabled}>
        {children}
      </button>
    )
  }

  return <div {...props}>{children}</div>
}

/** Restore focus to a saved element id after paint. */
export function useRestoreFocus(focusId: string | undefined) {
  useEffect(() => {
    if (!focusId) return
    const t = window.setTimeout(() => {
      const el = document.getElementById(focusId)
      if (el instanceof HTMLElement) {
        el.focus({ preventScroll: true })
        syncScrollToFocus(el)
      }
    }, 50)
    return () => window.clearTimeout(t)
  }, [focusId])
}
