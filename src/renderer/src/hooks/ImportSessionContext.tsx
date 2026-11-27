import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import {
  useImportSession,
  type UseImportSessionOptions,
  type UseImportSessionReturn
} from './useImportSession'

const ImportSessionContext = createContext<UseImportSessionReturn | null>(null)

export interface ImportSessionProviderProps extends UseImportSessionOptions {
  children: ReactNode
}

/**
 * Keeps the SD import session (input paths, scan result, live progress subscription,
 * completed report) above the tab-switched pages so it survives navigating away
 * from the Import tab, including while an import job is still running.
 */
export function ImportSessionProvider({
  children,
  ...options
}: ImportSessionProviderProps): ReactElement {
  const session = useImportSession(options)
  return <ImportSessionContext.Provider value={session}>{children}</ImportSessionContext.Provider>
}

export function useImportSessionContext(): UseImportSessionReturn {
  const session = useContext(ImportSessionContext)
  if (!session) {
    throw new Error('useImportSessionContext must be used within <ImportSessionProvider>.')
  }
  return session
}
