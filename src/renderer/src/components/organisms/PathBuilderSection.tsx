import { useMemo, type ReactElement, type ReactNode } from 'react'
import { FolderTree, RotateCcw } from 'lucide-react'
import type { PathPreset } from '@core/domain/models'
import { PATH_PRESETS } from '@core/domain/services/PathBuilderDomainService'
import { Badge, Button, Card, Input, Select, type SelectOption } from '../atoms'
import { PathPreviewBox, TokenChipBar } from '../molecules'

export interface PathBuilderSectionProps {
  destRoot: string
  pathTemplate: string
  onChangeTemplate: (template: string) => void
  onSelectPreset: (template: string) => void
  onInsertToken: (token: string) => void
  presets?: PathPreset[]
  disabled?: boolean
  /** Collapses the section behind a disclosure toggle with an always-visible summary. */
  collapsible?: boolean
  summary?: ReactNode
  className?: string
}

const CUSTOM_PRESET_VALUE = '__custom__'
const RECOMMENDED_TEMPLATE = '{YYYY}/{YYYY-MM-DD}/{Ext}'

/**
 * Interactive destination folder pattern builder with presets, custom template input,
 * one-click token chips, and live RAW / JPEG / VIDEO path previews.
 */
export function PathBuilderSection({
  destRoot,
  pathTemplate,
  onChangeTemplate,
  onSelectPreset,
  onInsertToken,
  presets = PATH_PRESETS,
  disabled = false,
  collapsible = false,
  summary,
  className
}: PathBuilderSectionProps): ReactElement {
  const matchedPreset = useMemo(
    () => presets.find((preset) => preset.template === pathTemplate.trim()),
    [presets, pathTemplate]
  )

  const selectOptions = useMemo<SelectOption[]>(() => {
    const presetOptions: SelectOption[] = presets.map((preset) => ({
      value: preset.template,
      label: preset.name
    }))
    if (!matchedPreset) {
      presetOptions.push({
        value: CUSTOM_PRESET_VALUE,
        label: 'カスタムパターン'
      })
    }
    return presetOptions
  }, [presets, matchedPreset])

  const selectedValue = matchedPreset ? matchedPreset.template : CUSTOM_PRESET_VALUE

  const handlePresetChange = (value: string) => {
    if (value === CUSTOM_PRESET_VALUE) {
      return
    }
    onSelectPreset(value)
  }

  return (
    <Card
      title="保存先フォルダ構成ビルダー"
      subtitle="撮影日（Exif）と拡張子から自動で振り分け階層を組み立てます"
      collapsible={collapsible}
      summary={summary}
      icon={<FolderTree className="h-4 w-4" />}
      headerRight={
        matchedPreset?.recommended ? (
          <Badge variant="emerald">推奨プリセット</Badge>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={() => onSelectPreset(RECOMMENDED_TEMPLATE)}
            disabled={disabled}
          >
            推奨に戻す
          </Button>
        )
      }
      className={className}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Select
            label="フォルダ構成プリセット"
            value={selectedValue}
            options={selectOptions}
            onChange={handlePresetChange}
            disabled={disabled}
          />
          {matchedPreset && (
            <p className="text-xs text-slate-400">{matchedPreset.description}</p>
          )}
        </div>

        <Input
          label="振り分けパターン文字列"
          value={pathTemplate}
          onChange={(e) => onChangeTemplate(e.target.value)}
          placeholder="{YYYY}/{YYYY-MM-DD}/{Ext}"
          helperText="スラッシュ（/）区切りでサブフォルダ階層を指定できます"
          disabled={disabled}
          className="font-mono text-xs sm:text-sm"
        />

        <TokenChipBar
          onSelectToken={(token) => {
            if (!disabled) {
              onInsertToken(token)
            }
          }}
        />

        <PathPreviewBox destRoot={destRoot} template={pathTemplate} />
      </div>
    </Card>
  )
}
