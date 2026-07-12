import type { Storyline } from '../../types'
import { assignLanes, type LanedNode } from './laneAssignment'
import { assignLabelRows, measureTextWidth } from './labelStagger'
import { clusterOverlappingMarkers } from './markerCluster'
import { getNodeSpan } from '../date/historicalDate'

export interface LayoutedNode extends LanedNode {
  /** true when this node's marker visually overlaps a neighbor and is represented by a cluster badge instead */
  clustered: boolean
  /** perpendicular pixel offset from the track baseline for this node's label (unused when clustered) */
  labelOffset: number
  /** pixel offset along the time axis applied to the label when it had to be nudged clear of neighbors (0 = no nudge) */
  labelShift: number
  /** pixel start/end along the time axis, clamped to the visible plot area — use these (not `start`/`end`) for marker/bar rendering so partially-visible ranges are clipped at the edge instead of drawn off-canvas */
  renderStartPos: number
  renderEndPos: number
}

export interface MarkerCluster {
  id: string
  nodeIds: string[]
  lane: number
  /** midpoint time (in the same units as node start/end) to center the badge and zoom target on */
  center: number
  start: number
  end: number
}

export interface StorylineLayout {
  storyline: Storyline
  /** distance in px from the main axis to this storyline's baseline lane */
  baseOffset: number
  bandHeight: number
  lanedNodes: LayoutedNode[]
  clusters: MarkerCluster[]
}

const LANE_HEIGHT = 26
const MIN_BAND = 36
const BAND_GAP = 14
const LABEL_FONT_SIZE = 10
export const LABEL_BASE_OFFSET = 14
const LABEL_ROW_STEP = 13
const MAX_LABEL_ROWS = 4
/** half the marker circle's rendered footprint, in px, used for marker-vs-marker collision only */
const MARKER_HALF_FOOTPRINT = 7
const MIN_BAR_HALF_WIDTH = 4

export interface LayoutOptions {
  /** projects a time value to a pixel position along the time axis at the current zoom/pan */
  timeToPos: (t: number) => number
  isHorizontal: boolean
  /** extra clearance to reserve before the first "above" band (e.g. tick labels in vertical mode) */
  aboveReserved?: number
  /** extra clearance to reserve before the first "below" band (e.g. tick labels in horizontal mode) */
  belowReserved?: number
  /** pixel range (along the time axis) labels must stay within, so they never render past the plot edge into the storyline title or tick-label margins */
  axisBounds?: { start: number; end: number }
  /** current viewport's visible time range (same units as node start/end) — nodes entirely outside it are skipped instead of rendering far off-canvas */
  visibleRange?: { start: number; end: number }
}

/**
 * Compute per-storyline vertical (or horizontal, in vertical mode) offsets
 * from the main axis, stacking storylines by `order` — order 1 sits
 * closest to the axis, higher order values sit further away.
 *
 * Two independent collision passes run per storyline:
 *  1. Marker-level (pixel footprint of the circle/bar itself, per lane) —
 *     only genuinely overlapping markers merge into a "+N" cluster badge.
 *  2. Label-level (pixel text width, among non-clustered nodes) — resolved
 *     by staggering into extra rows, then by nudging along the axis with a
 *     leader line. Labels are never hidden.
 */
export function computeStorylineLayouts(
  storylines: Storyline[],
  options: LayoutOptions
): { above: StorylineLayout[]; below: StorylineLayout[] } {
  const build = (list: Storyline[], reserved: number) => {
    const sorted = [...list].sort((a, b) => a.order - b.order)
    let cumulative = BAND_GAP + reserved
    const layouts: StorylineLayout[] = []
    for (const storyline of sorted) {
      const visibleNodes = options.visibleRange
        ? storyline.nodes.filter((node) => {
            try {
              const [s, e] = getNodeSpan(node)
              return e >= options.visibleRange!.start && s <= options.visibleRange!.end
            } catch {
              return false
            }
          })
        : storyline.nodes
      const laned = assignLanes(visibleNodes)
      const laneCount = Math.max(1, ...laned.map((n) => n.lane + 1))

      // Pixel start/end, clipped to the visible plot area, computed once so
      // marker collision, label collision, and rendering all agree on what's
      // actually on screen — a range that runs off the right edge should be
      // treated (and drawn) as ending at the edge, not at its true off-canvas end.
      const bounds = options.axisBounds
      const renderPosById = new Map<string, { start: number; end: number }>()
      for (const n of laned) {
        const rawStart = options.timeToPos(n.start)
        const rawEnd = options.timeToPos(n.end)
        renderPosById.set(n.node.id, {
          start: bounds ? Math.max(rawStart, bounds.start) : rawStart,
          end: bounds ? Math.min(rawEnd, bounds.end) : rawEnd,
        })
      }

      // --- pass 1: marker-vs-marker pixel collision, per lane ---
      const byLane = new Map<number, LanedNode[]>()
      for (const n of laned) {
        const arr = byLane.get(n.lane) ?? []
        arr.push(n)
        byLane.set(n.lane, arr)
      }
      const clusterOf = new Map<string, string>()
      for (const [, laneNodes] of byLane) {
        const candidates = laneNodes.map((n) => {
          const { start: startPos, end: endPos } = renderPosById.get(n.node.id)!
          const isRange = n.node.timeRange !== undefined
          const halfFootprint = isRange
            ? Math.max(Math.abs(endPos - startPos), MIN_BAR_HALF_WIDTH * 2) / 2
            : MARKER_HALF_FOOTPRINT
          return { id: n.node.id, axisPos: (startPos + endPos) / 2, halfFootprint }
        })
        for (const [id, clusterId] of clusterOverlappingMarkers(candidates)) {
          clusterOf.set(id, clusterId)
        }
      }

      // --- pass 2: label-vs-label pixel collision, among non-clustered nodes only ---
      const soloNodes = laned.filter((n) => !clusterOf.has(n.node.id))
      const labelCandidates = soloNodes.map((n) => {
        const { start: startPos, end: endPos } = renderPosById.get(n.node.id)!
        const axisPos = (startPos + endPos) / 2
        const halfExtent = options.isHorizontal
          ? measureTextWidth(n.node.title, LABEL_FONT_SIZE) / 2 + 4
          : LABEL_FONT_SIZE / 2 + 4
        return { id: n.node.id, axisPos, halfExtent }
      })
      const placements = assignLabelRows(labelCandidates, MAX_LABEL_ROWS)
      const placementById = new Map(placements.map((p) => [p.id, p]))
      const halfExtentById = new Map(labelCandidates.map((c) => [c.id, c.halfExtent]))

      let maxRowUsed = 0
      const lanedNodes: LayoutedNode[] = laned.map((n) => {
        const clustered = clusterOf.has(n.node.id)
        const p = placementById.get(n.node.id)
        if (p) maxRowUsed = Math.max(maxRowUsed, Math.min(p.row, MAX_LABEL_ROWS))
        const { start: renderStartPos, end: renderEndPos } = renderPosById.get(n.node.id)!
        const axisPos = (renderStartPos + renderEndPos) / 2
        let displayAxisPos = p ? p.displayAxisPos : axisPos
        if (bounds) {
          const halfExtent = halfExtentById.get(n.node.id) ?? 0
          displayAxisPos = Math.min(Math.max(displayAxisPos, bounds.start + halfExtent), bounds.end - halfExtent)
        }
        return {
          ...n,
          clustered,
          labelOffset: LABEL_BASE_OFFSET + (p ? p.row : 0) * LABEL_ROW_STEP,
          labelShift: displayAxisPos - axisPos,
          renderStartPos,
          renderEndPos,
        }
      })

      const clusters = buildClusters(laned, clusterOf)
      const labelSpace = LABEL_BASE_OFFSET + maxRowUsed * LABEL_ROW_STEP + LABEL_FONT_SIZE + 6
      const bandHeight = Math.max(MIN_BAND, laneCount * LANE_HEIGHT, labelSpace)

      layouts.push({ storyline, baseOffset: cumulative, bandHeight, lanedNodes, clusters })
      cumulative += bandHeight + BAND_GAP
    }
    return layouts
  }

  return {
    above: build(storylines.filter((s) => s.position === 'above'), options.aboveReserved ?? 0),
    below: build(storylines.filter((s) => s.position === 'below'), options.belowReserved ?? 0),
  }
}

function buildClusters(laned: LanedNode[], clusterOf: Map<string, string>): MarkerCluster[] {
  const byCluster = new Map<string, LanedNode[]>()
  for (const n of laned) {
    const clusterId = clusterOf.get(n.node.id)
    if (!clusterId) continue
    const arr = byCluster.get(clusterId) ?? []
    arr.push(n)
    byCluster.set(clusterId, arr)
  }
  return [...byCluster.entries()].map(([id, nodes]) => {
    const start = Math.min(...nodes.map((n) => n.start))
    const end = Math.max(...nodes.map((n) => n.end))
    return { id, nodeIds: nodes.map((n) => n.node.id), lane: nodes[0].lane, center: (start + end) / 2, start, end }
  })
}

export function totalExtent(layouts: StorylineLayout[]): number {
  if (layouts.length === 0) return 40
  const last = layouts[layouts.length - 1]
  return last.baseOffset + last.bandHeight + 20
}
