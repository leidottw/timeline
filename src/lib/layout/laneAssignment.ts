import type { TimelineNode } from '../../types'
import { getNodeSpan } from '../date/historicalDate'

export interface LanedNode {
  node: TimelineNode
  lane: number
  start: number
  end: number
}

/**
 * Assign each node in a storyline to a "lane" (0, 1, 2, ...) so that
 * overlapping time spans don't visually collide. Uses a simple greedy
 * interval scheduling approach: sort by start, place each node in the
 * first lane whose last-placed node has already ended.
 *
 * A minimum virtual width (minGap) is used *only* to decide lane
 * placement, so point-in-time nodes rendered close together still get
 * separated into different lanes. The returned `start`/`end` are always
 * the node's true, unpadded time span — callers use these for actual
 * rendering (marker position, label anchoring, connector lines), so a
 * point node's marker always sits exactly on its real time value instead
 * of drifting toward an artificially widened midpoint.
 */
export function assignLanes(nodes: TimelineNode[], minGap = 0.6): LanedNode[] {
  const spans = nodes
    .map((node) => {
      try {
        const [start, end] = getNodeSpan(node)
        return { node, start, end, laneEnd: Math.max(end, start + minGap) }
      } catch {
        return null
      }
    })
    .filter((v): v is { node: TimelineNode; start: number; end: number; laneEnd: number } => v !== null)
    .sort((a, b) => a.start - b.start)

  const laneEnds: number[] = []
  const result: LanedNode[] = []

  for (const span of spans) {
    let lane = laneEnds.findIndex((end) => end <= span.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(span.laneEnd)
    } else {
      laneEnds[lane] = span.laneEnd
    }
    result.push({ node: span.node, lane, start: span.start, end: span.end })
  }

  return result
}
