import { useState, type ReactElement } from 'react'
import {
  DashboardPage,
  HistoryPage,
  ImportPage,
  SettingsPage
} from './components/pages'
import { MainAppTemplate, type AppTab } from './components/templates'

export function App(): ReactElement {
  const [activeTab, setActiveTab] = useState<AppTab>('import')

  return (
    <MainAppTemplate activeTab={activeTab} onTabChange={setActiveTab}>
      <div className={activeTab === 'import' ? undefined : 'hidden'}>
        <ImportPage />
      </div>
      {activeTab === 'dashboard' && <DashboardPage />}
      {activeTab === 'history' && <HistoryPage />}
      {activeTab === 'settings' && <SettingsPage />}
    </MainAppTemplate>
  )
}

export default App
