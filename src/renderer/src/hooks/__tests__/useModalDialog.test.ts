import { describe, expect, it } from 'vitest'
import { isFocusCandidate, resolveFocusTrapTarget, type FocusCandidateState } from '../useModalDialog'

describe('resolveFocusTrapTarget', () => {
  const items: string[] = ['close', 'copy', 'pre']

  it('moves forward on Tab and wraps from the last element to the first', () => {
    expect(resolveFocusTrapTarget(items, 'close', false)).toBe('copy')
    expect(resolveFocusTrapTarget(items, 'copy', false)).toBe('pre')
    expect(resolveFocusTrapTarget(items, 'pre', false)).toBe('close')
  })

  it('moves backward on Shift+Tab and wraps from the first element to the last', () => {
    expect(resolveFocusTrapTarget(items, 'pre', true)).toBe('copy')
    expect(resolveFocusTrapTarget(items, 'copy', true)).toBe('close')
    expect(resolveFocusTrapTarget(items, 'close', true)).toBe('pre')
  })

  it('pulls focus back into the dialog when it is outside the focusable list', () => {
    expect(resolveFocusTrapTarget(items, 'outside', false)).toBe('close')
    expect(resolveFocusTrapTarget(items, 'outside', true)).toBe('pre')
    expect(resolveFocusTrapTarget(items, null, false)).toBe('close')
  })

  it('keeps focus on the only element when there is just one', () => {
    expect(resolveFocusTrapTarget(['close'], 'close', false)).toBe('close')
    expect(resolveFocusTrapTarget(['close'], 'close', true)).toBe('close')
  })

  it('returns null when there is nothing focusable', () => {
    expect(resolveFocusTrapTarget([], null, false)).toBeNull()
  })
})

describe('isFocusCandidate', () => {
  const visible: FocusCandidateState = {
    disabled: false,
    ariaHidden: false,
    display: 'block',
    visibility: 'visible',
    hasLayoutBox: true
  }

  it('accepts a visible, enabled element', () => {
    expect(isFocusCandidate(visible)).toBe(true)
  })

  it('rejects disabled or aria-hidden elements', () => {
    expect(isFocusCandidate({ ...visible, disabled: true })).toBe(false)
    expect(isFocusCandidate({ ...visible, ariaHidden: true })).toBe(false)
  })

  it('rejects elements that are not rendered', () => {
    expect(isFocusCandidate({ ...visible, display: 'none' })).toBe(false)
    expect(isFocusCandidate({ ...visible, visibility: 'hidden' })).toBe(false)
    expect(isFocusCandidate({ ...visible, hasLayoutBox: false })).toBe(false)
  })
})
