import { Notification } from 'electron'
import type { SessionDigest } from '@core/domain/models'
import type { INotificationGateway } from '@core/domain/ports'

export interface ElectronNotificationGatewayOptions {
  isEnabled?: () => boolean
  onNotificationClick?: () => void
}

/**
 * Electron OS-native `Notification` implementation of `INotificationGateway`.
 * Displays a summary of the completed import session (copied count, top camera/lens, and shooting style tag)
 * and brings the main Sabaki window to the front when clicked.
 */
export class ElectronNotificationGateway implements INotificationGateway {
  constructor(
    private readonly options: ElectronNotificationGatewayOptions = {}
  ) {}

  public notifyImportComplete(digest: SessionDigest): void {
    if (this.options.isEnabled && !this.options.isEnabled()) {
      return
    }

    try {
      if (!Notification.isSupported()) {
        return
      }

      const notification = new Notification({
        title: `✅ Sabaki: ${digest.copiedFiles}枚の取り込み完了`,
        body: digest.headlineSummary
      })

      notification.on('click', () => {
        this.options.onNotificationClick?.()
      })

      notification.show()
    } catch {
      // Ignore notification errors in headless/CI environments
    }
  }
}
