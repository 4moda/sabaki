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
 * Decides where focus should move when Tab / Shift+Tab is pressed inside a modal.
 * Returns the element to focus explicitly, or `null` to let the browser move focus normally.
 * When focus is not on any of the focusable elements (e.g. on the dialog container itself),
 * focus wraps to the first (Tab) or last (Shift+Tab) element.
 */
export function resolveFocusTrapTarget<T>(
  focusables: readonly T[],
  active: T | null,
  shiftKey: boolean
): T | null {
  if (focusables.length === 0) return null
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const index = active === null ? -1 : focusables.indexOf(active)

  if (index === -1) return shiftKey ? last : first
  if (shiftKey && index === 0) return last
  if (!shiftKey && index === focusables.length - 1) return first
  return null
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

    const getFocusables = (): HTMLElement[] =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))

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

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
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
