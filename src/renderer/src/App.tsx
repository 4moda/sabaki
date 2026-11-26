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
  const { settings, isLoading, isLoaded } = useAppSettings()

  return (
    <MainAppTemplate
      activeTab={activeTab}
      onTabChange={setActiveTab}
      isTrayResident={isLoaded ? settings.minimizeToTray : null}
      isTraySettingsLoading={isLoading}
    >
      {activeTab === 'import' && <ImportPage />}
      {activeTab === 'dashboard' && <DashboardPage />}
      {activeTab === 'history' && <HistoryPage />}
      {activeTab === 'settings' && <SettingsPage />}
    </MainAppTemplate>
  )
}

export default App
