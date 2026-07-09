import type { Storyline } from '../../types'
import { assignLanes, type LanedNode } from './laneAssignment'

export interface StorylineLayout {
  storyline: Storyline
  /** distance in px from the main axis to this storyline's baseline lane */
  baseOffset: number
  bandHeight: number
  lanedNodes: LanedNode[]
}

const LANE_HEIGHT = 26
const MIN_BAND = 36
const BAND_GAP = 14

/**
 * Compute per-storyline vertical (or horizontal, in vertical mode) offsets
 * from the main axis, stacking storylines by `order` — order 1 sits
 * closest to the axis, higher order values sit further away.
 */
export function computeStorylineLayouts(storylines: Storyline[]): {
  above: StorylineLayout[]
  below: StorylineLayout[]
} {
  const build = (list: Storyline[]) => {
    const sorted = [...list].sort((a, b) => a.order - b.order)
    let cumulative = BAND_GAP
    const layouts: StorylineLayout[] = []
    for (const storyline of sorted) {
      const lanedNodes = assignLanes(storyline.nodes)
      const laneCount = Math.max(1, ...lanedNodes.map((n) => n.lane + 1))
      const bandHeight = Math.max(MIN_BAND, laneCount * LANE_HEIGHT)
      layouts.push({ storyline, baseOffset: cumulative, bandHeight, lanedNodes })
      cumulative += bandHeight + BAND_GAP
    }
    return layouts
  }

  return {
    above: build(storylines.filter((s) => s.position === 'above')),
    below: build(storylines.filter((s) => s.position === 'below')),
  }
}

export function totalExtent(layouts: StorylineLayout[]): number {
  if (layouts.length === 0) return 40
  const last = layouts[layouts.length - 1]
  return last.baseOffset + last.bandHeight + 20
}
