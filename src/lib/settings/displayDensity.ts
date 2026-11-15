import type { DisplayDensity } from '../../types'

export const DEFAULT_DISPLAY_DENSITY: DisplayDensity = 'comfortable'

export function parseDisplayDensity(value: unknown): DisplayDensity | undefined {
  return value === 'comfortable' || value === 'compact' ? value : undefined
}
