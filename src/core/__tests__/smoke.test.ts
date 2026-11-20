import { describe, expect, it } from 'vitest'
import { APP_NAME, APP_VERSION } from '../application/dto'

describe('Sabaki foundation smoke test', () => {
  it('exposes application metadata from core layer', () => {
    expect(APP_NAME).toBe('Sabaki')
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
