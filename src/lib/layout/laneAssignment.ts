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
 * A minimum visual width (minGapFraction of the node's own span) is
 * added so that point-in-time nodes rendered close together also get
 * separated into different lanes.
 */
export function assignLanes(nodes: TimelineNode[], minGap = 0.6): LanedNode[] {
  const spans = nodes
    .map((node) => {
      try {
        const [start, end] = getNodeSpan(node)
        return { node, start, end: Math.max(end, start + minGap) }
      } catch {
        return null
      }
    })
    .filter((v): v is { node: TimelineNode; start: number; end: number } => v !== null)
    .sort((a, b) => a.start - b.start)

  const laneEnds: number[] = []
  const result: LanedNode[] = []

  for (const span of spans) {
    let lane = laneEnds.findIndex((end) => end <= span.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(span.end)
    } else {
      laneEnds[lane] = span.end
    }
    result.push({ node: span.node, lane, start: span.start, end: span.end })
  }

  return result
}
