import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ImportSessionProvider } from './hooks'
import './styles/main.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {/* Import session lives above the tab-switched pages so it survives tab navigation */}
    <ImportSessionProvider>
      <App />
    </ImportSessionProvider>
  </React.StrictMode>
)
