import { useState, type ReactElement } from 'react'
import {
  DashboardPage,
  HistoryPage,
  ImportPage,
  SettingsPage
} from './components/pages'
import { MainAppTemplate, type AppTab } from './components/templates'
import { useAppSettings } from './hooks'

export function App(): ReactElement {
  const [activeTab, setActiveTab] = useState<AppTab>('import')
  const { settings, isLoading } = useAppSettings()

  return (
    <MainAppTemplate
      activeTab={activeTab}
      onTabChange={setActiveTab}
      isTrayResident={isLoading ? null : settings.minimizeToTray}
    >
      {activeTab === 'import' && <ImportPage />}
      {activeTab === 'dashboard' && <DashboardPage />}
      {activeTab === 'history' && <HistoryPage />}
      {activeTab === 'settings' && <SettingsPage />}
    </MainAppTemplate>
  )
}

export default App
