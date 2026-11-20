import type { SabakiApi } from '@core/application/dto'

declare global {
  interface Window {
    sabaki: SabakiApi
  }
}
