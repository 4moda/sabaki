import { useEffect, useRef, type MouseEvent, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

/**
 * Decides where focus moves when Tab / Shift+Tab is pressed inside a modal.
 * Focus always moves explicitly within `focusables` (wrapping at both ends), so elements
 * excluded from the list are skipped. When focus is not on any of them (e.g. on the dialog
 * container itself), it goes to the first (Tab) or last (Shift+Tab) element.
 * Returns `null` only when there is nothing focusable.
 */
export function resolveFocusTrapTarget<T>(
  focusables: readonly T[],
  active: T | null,
  shiftKey: boolean
): T | null {
  const count = focusables.length
  if (count === 0) return null
  const index = active === null ? -1 : focusables.indexOf(active)

  if (index === -1) return shiftKey ? focusables[count - 1] : focusables[0]
  return focusables[(index + (shiftKey ? -1 : 1) + count) % count]
}

export interface FocusCandidateState {
  disabled: boolean
  /** The element or one of its ancestors has `aria-hidden="true"`. */
  ariaHidden: boolean
  display: string
  visibility: string
  /** Whether the element produces any layout box (`getClientRects().length > 0`). */
  hasLayoutBox: boolean
}

/** Whether an element matched by the focusable selector should take part in the focus trap. */
export function isFocusCandidate(state: FocusCandidateState): boolean {
  if (state.disabled || state.ariaHidden) return false
  if (state.display === 'none' || state.visibility === 'hidden') return false
  return state.hasLayoutBox
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    const style = window.getComputedStyle(el)
    return isFocusCandidate({
      disabled: el.hasAttribute('disabled'),
      ariaHidden: el.closest('[aria-hidden="true"]') !== null,
      display: style.display,
      visibility: style.visibility,
      hasLayoutBox: el.getClientRects().length > 0
    })
  })
}

export interface UseModalDialogOptions {
  /** Whether modal behavior (Esc, focus trap, focus restore) is active. */
  enabled: boolean
  /** Called on Esc or overlay click. When omitted, the dialog cannot be dismissed this way. */
  onClose?: () => void
}

export interface UseModalDialogReturn<T extends HTMLElement> {
  /** Attach to the dialog panel (the element that contains all focusable content). */
  dialogRef: RefObject<T | null>
  /** Spread onto the overlay element to close on background click. */
  overlayProps: {
    onMouseDown: (event: MouseEvent<HTMLElement>) => void
    onClick: (event: MouseEvent<HTMLElement>) => void
  }
}

/**
 * Minimal modal dialog behavior without external dependencies:
 * Esc to close, overlay click to close, initial focus, Tab focus trap,
 * and focus restoration to the previously focused (trigger) element on unmount.
 */
export function useModalDialog<T extends HTMLElement = HTMLDivElement>({
  enabled,
  onClose
}: UseModalDialogOptions): UseModalDialogReturn<T> {
  const dialogRef = useRef<T | null>(null)
  const onCloseRef = useRef(onClose)
  const pointerDownOnOverlayRef = useRef(false)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!enabled) return
    const dialog = dialogRef.current
    if (!dialog) return

    // Element focused before the dialog opened; focus returns here on close.
    // (Under StrictMode the cleanup restores focus first, so the re-run captures it again.)
    const trigger =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const getFocusables = (): HTMLElement[] => getFocusableElements(dialog)

    const initial = getFocusables()[0] ?? dialog
    initial.focus()

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing) return
      if (event.key === 'Escape') {
        if (onCloseRef.current) {
          event.preventDefault()
          onCloseRef.current()
        }
        return
      }
      if (event.key !== 'Tab') return

      const focusables = getFocusables()
      if (focusables.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const active =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      const target = resolveFocusTrapTarget(focusables, active, event.shiftKey)
      if (target) {
        event.preventDefault()
        target.focus()
      }
    }

    // Pull focus back if it escapes the dialog by other means (e.g. programmatic focus).
    const handleFocusIn = (event: FocusEvent): void => {
      const target = event.target
      if (target instanceof Node && !dialog.contains(target)) {
        ;(getFocusables()[0] ?? dialog).focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', handleFocusIn)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', handleFocusIn)
      if (trigger && trigger.isConnected) {
        trigger.focus()
      }
    }
  }, [enabled])

  const overlayProps = {
    // Track where the press started so that a text selection dragged from inside
    // the card and released on the overlay does not close the dialog.
    onMouseDown: (event: MouseEvent<HTMLElement>): void => {
      pointerDownOnOverlayRef.current = event.target === event.currentTarget
    },
    onClick: (event: MouseEvent<HTMLElement>): void => {
      const startedOnOverlay = pointerDownOnOverlayRef.current
      pointerDownOnOverlayRef.current = false
      if (startedOnOverlay && event.target === event.currentTarget) {
        onCloseRef.current?.()
      }
    }
  }

  return { dialogRef, overlayProps }
}
