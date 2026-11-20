import type { SessionDigest } from '../models/SessionDigest'

/**
 * Infrastructure gateway port for sending OS-native import completion notifications.
 */
export interface INotificationGateway {
  notifyImportComplete(digest: SessionDigest): void
}
