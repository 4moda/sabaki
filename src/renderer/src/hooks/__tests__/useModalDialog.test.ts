import { describe, expect, it } from 'vitest'
import { resolveFocusTrapTarget } from '../useModalDialog'

describe('resolveFocusTrapTarget', () => {
  const items: string[] = ['close', 'copy', 'pre']

  it('wraps from the last element to the first on Tab', () => {
    expect(resolveFocusTrapTarget(items, 'pre', false)).toBe('close')
  })

  it('wraps from the first element to the last on Shift+Tab', () => {
    expect(resolveFocusTrapTarget(items, 'close', true)).toBe('pre')
  })

  it('lets the browser move focus between inner elements', () => {
    expect(resolveFocusTrapTarget(items, 'close', false)).toBeNull()
    expect(resolveFocusTrapTarget(items, 'copy', false)).toBeNull()
    expect(resolveFocusTrapTarget(items, 'copy', true)).toBeNull()
    expect(resolveFocusTrapTarget(items, 'pre', true)).toBeNull()
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
