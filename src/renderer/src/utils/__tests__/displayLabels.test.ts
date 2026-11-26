import { describe, expect, it } from 'vitest'
import type { ImportJobStatus } from '@core/domain/models'
import {
  getImportJobStatusDisplay,
  getTrayStatusDisplay
} from '@renderer/utils/displayLabels'

describe('Renderer display labels', () => {
  it('maps every ImportJobStatus to a Japanese badge label', () => {
    const expected: Record<ImportJobStatus, string> = {
      pending: '待機中',
      running: '実行中',
      completed: '完了',
      failed: '失敗',
      cancelled: 'キャンセル'
    }
    for (const [status, label] of Object.entries(expected)) {
      expect(getImportJobStatusDisplay(status as ImportJobStatus).label).toBe(label)
    }
  })

  it('keeps badge colors: completed=emerald, failed=rose, others=amber', () => {
    expect(getImportJobStatusDisplay('completed').variant).toBe('emerald')
    expect(getImportJobStatusDisplay('failed').variant).toBe('rose')
    expect(getImportJobStatusDisplay('running').variant).toBe('amber')
    expect(getImportJobStatusDisplay('pending').variant).toBe('amber')
    expect(getImportJobStatusDisplay('cancelled').variant).toBe('amber')
  })

  it('falls back to the raw value for unknown statuses', () => {
    expect(getImportJobStatusDisplay('archived')).toEqual({
      label: 'archived',
      variant: 'default'
    })
  })

  it('derives the sidebar tray badge from minimizeToTray', () => {
    expect(getTrayStatusDisplay(true)).toEqual({
      label: 'タスクトレイ常駐中',
      isResident: true
    })
    expect(getTrayStatusDisplay(false)).toEqual({
      label: 'タスクトレイ常駐オフ',
      isResident: false
    })
  })
})
