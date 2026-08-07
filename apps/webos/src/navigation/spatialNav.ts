const FOCUSABLE_SELECTOR = '.focusable[tabindex]:not([tabindex="-1"])'

export type NavDirection = 'left' | 'right' | 'up' | 'down'

function isVisible(el: HTMLElement): boolean {
  if (el.getAttribute('aria-disabled') === 'true') return false
  const style = window.getComputedStyle(el)
  if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') {
    return false
  }
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export function getFocusables(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible)
}

function center(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function contentOffsetTop(el: HTMLElement, container: HTMLElement): number {
  const cRect = container.getBoundingClientRect()
  const eRect = el.getBoundingClientRect()
  return eRect.top - cRect.top + container.scrollTop
}

function isInTopFocusBand(focused: HTMLElement, main: HTMLElement): boolean {
  const mainFocusables = getFocusables(main)
  if (!mainFocusables.length) return false

  let minTop = Number.POSITIVE_INFINITY
  for (const el of mainFocusables) {
    minTop = Math.min(minTop, contentOffsetTop(el, main))
  }

  const focusedTop = contentOffsetTop(focused, main)
  return focusedTop <= minTop + 120
}

/**
 * When focus lands on the top-most focusable row of the current screen,
 * pin the main scroller back to the top so headers/hero stay visible.
 */
export function syncScrollToFocus(focused: HTMLElement): void {
  const main = document.querySelector<HTMLElement>('.app-main:not(.app-main--player)')
  if (!main) return

  // Focusing side nav also resets content scroll so returning to content starts clean
  if (focused.closest('.side-nav')) {
    if (main.scrollTop > 0) {
      main.scrollTo({ top: 0, behavior: 'smooth' })
    }
    return
  }

  if (!main.contains(focused)) return

  if (isInTopFocusBand(focused, main) && main.scrollTop > 0) {
    main.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function scoreCandidate(
  from: DOMRect,
  to: DOMRect,
  direction: NavDirection,
): number | null {
  const a = center(from)
  const b = center(to)
  const dx = b.x - a.x
  const dy = b.y - a.y

  const overlapX = Math.max(0, Math.min(from.right, to.right) - Math.max(from.left, to.left))
  const overlapY = Math.max(0, Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top))

  switch (direction) {
    case 'left':
      if (dx >= -8) return null
      return Math.abs(dx) + (overlapY > 0 ? 0 : Math.abs(dy) * 2.4)
    case 'right':
      if (dx <= 8) return null
      return Math.abs(dx) + (overlapY > 0 ? 0 : Math.abs(dy) * 2.4)
    case 'up':
      if (dy >= -8) return null
      return Math.abs(dy) + (overlapX > 0 ? 0 : Math.abs(dx) * 2.4)
    case 'down':
      if (dy <= 8) return null
      return Math.abs(dy) + (overlapX > 0 ? 0 : Math.abs(dx) * 2.4)
  }
}

export function findNextFocusable(
  current: HTMLElement | null,
  direction: NavDirection,
  root: ParentNode = document,
): HTMLElement | null {
  const candidates = getFocusables(root)
  if (!candidates.length) return null

  if (!current || !candidates.includes(current)) {
    return candidates[0] ?? null
  }

  const from = current.getBoundingClientRect()
  let best: HTMLElement | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    if (candidate === current) continue
    const score = scoreCandidate(from, candidate.getBoundingClientRect(), direction)
    if (score == null) continue
    if (score < bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best
}

export function moveFocus(direction: NavDirection, root: ParentNode = document): boolean {
  const active = document.activeElement
  const current = active instanceof HTMLElement && active.classList.contains('focusable')
    ? active
    : active instanceof HTMLElement
      ? active.closest<HTMLElement>('.focusable')
      : null

  const next = findNextFocusable(current, direction, root)
  if (!next) return false
  next.focus({ preventScroll: true })
  syncScrollToFocus(next)

  const main = document.querySelector<HTMLElement>('.app-main:not(.app-main--player)')
  const atTopBand = Boolean(main && main.contains(next) && isInTopFocusBand(next, main))
  if (!atTopBand) {
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }
  return true
}

export function focusFirstIn(selector: string): boolean {
  const root = document.querySelector(selector)
  if (!root) return false
  const first = getFocusables(root)[0]
  if (!first) return false
  first.focus({ preventScroll: true })
  syncScrollToFocus(first)
  return true
}

/** webOS / TV remote key helpers */
export function directionFromKey(e: KeyboardEvent): NavDirection | null {
  switch (e.key) {
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    default:
      break
  }
  // Legacy keyCodes used by some webOS remotes
  switch (e.keyCode) {
    case 37:
      return 'left'
    case 39:
      return 'right'
    case 38:
      return 'up'
    case 40:
      return 'down'
    default:
      return null
  }
}

export function isSelectKey(e: KeyboardEvent): boolean {
  return e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32
}

export function isBackKey(e: KeyboardEvent): boolean {
  return e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 461 || e.keyCode === 27
}
