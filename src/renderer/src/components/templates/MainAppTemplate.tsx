import type { ReactElement, ReactNode } from 'react'
import { clsx } from 'clsx'
import { BarChart3, FolderInput, History, Settings } from 'lucide-react'
import { getTrayStatusDisplay } from '../../utils/displayLabels'
import { Badge, SabakiLogoIcon } from '../atoms'

export type AppTab = 'import' | 'dashboard' | 'history' | 'settings'

export interface MainAppTemplateProps {
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
  children: ReactNode
  /** Mirrors the `minimizeToTray` setting; `null` while settings are loading. */
  isTrayResident?: boolean | null
  /** While `isTrayResident` is null: true = still loading, false = loading failed. */
  isTraySettingsLoading?: boolean
  /** Overrides the badge text derived from `isTrayResident`. */
  trayStatusText?: string
  className?: string
}

interface NavItem {
  id: AppTab
  label: string
  icon: ReactNode
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'import',
    label: 'SD取込・整理',
    icon: <FolderInput className="h-4 w-4" />
  },
  {
    id: 'dashboard',
    label: '撮影分析',
    icon: <BarChart3 className="h-4 w-4" />
  },
  {
    id: 'history',
    label: '取込履歴',
    icon: <History className="h-4 w-4" />
  },
  {
    id: 'settings',
    label: '常駐・設定',
    icon: <Settings className="h-4 w-4" />
  }
]

/**
 * Overall application shell with left sidebar navigation, brand header, tray status badge,
 * and scrollable main content area.
 */
export function MainAppTemplate({
  activeTab,
  onTabChange,
  children,
  isTrayResident = true,
  isTraySettingsLoading = true,
  trayStatusText,
  className
}: MainAppTemplateProps): ReactElement {
  const trayStatus = getTrayStatusDisplay(isTrayResident, isTraySettingsLoading)
  return (
    <div
      className={clsx(
        'flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100',
        className
      )}
    >
      <aside className="flex w-64 shrink-0 flex-col justify-between border-r border-slate-800/90 bg-slate-900/70 p-4">
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-3 px-1">
            <SabakiLogoIcon className="h-10 w-10 shrink-0" title="Sabaki" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold tracking-tight text-slate-100">
                Sabaki サバキ
              </h1>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                Resident SD Sorter &amp; Exif Analytics
              </p>
            </div>
          </div>

          <nav aria-label="メインナビゲーション" className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.id === activeTab
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100 border border-transparent'
                  )}
                >
                  <span
                    className={clsx(
                      'shrink-0',
                      isActive ? 'text-emerald-400' : 'text-slate-400'
                    )}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        <div className="border-t border-slate-800/80 pt-4">
          <Badge
            variant={trayStatus.isResident ? 'emerald' : 'default'}
            className="w-full justify-center py-1"
          >
            <span
              className={clsx(
                'h-2 w-2 rounded-full',
                trayStatus.isResident ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              )}
              aria-hidden="true"
            />
            <span>{trayStatusText ?? trayStatus.label}</span>
          </Badge>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-950 p-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  )
}
