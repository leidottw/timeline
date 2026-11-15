/**
 * Pixel-space collision avoidance for node labels along the time axis.
 *
 * Unlike `assignLanes` (time-domain, zoom-independent), this operates on
 * already-projected pixel positions, so it must be re-run whenever the
 * viewport (zoom/pan) changes. Labels that overlap horizontally (or, in
 * vertical orientation, vertically) are staggered into extra rows first.
 * If `maxRows` of stagger still isn't enough, remaining labels are packed
 * into one extra "overflow" row and nudged sideways along the axis just
 * enough to clear their neighbors — connected back to the true node
 * position with a leader line. Labels are never hidden or collapsed;
 * only genuinely overlapping *markers* are (see `markerCluster.ts`).
 */

export interface LabelCandidate {
  id: string
  /** pixel position along the time axis */
  axisPos: number
  /** half of the label's footprint along the time axis, in pixels */
  halfExtent: number
  /** which marker lane this label's node sits in, so a stagger row can be checked against *other* lanes' markers/bars */
  lane: number
}

export interface LaneObstacle {
  /** pixel range along the time axis this marker/bar occupies */
  start: number
  end: number
}

export interface LabelPlacement {
  id: string
  /** stagger row, 0 = closest to the marker. `maxRows` = the overflow row. */
  row: number
  /** pixel position along the time axis to actually render the label at (may differ from axisPos when nudged in the overflow row) */
  displayAxisPos: number
}

export interface LabelRowOptions {
  /** occupied pixel intervals per lane index — used to keep a staggered label from climbing into another lane's marker/bar */
  laneOccupancy: Map<number, LaneObstacle[]>
  /** perpendicular pixel distance between adjacent lanes (must match the caller's lane spacing) */
  laneHeight: number
  /** perpendicular pixel distance from a node's own lane to its row-0 label */
  baseOffset: number
  /** perpendicular pixel distance added per extra stagger row */
  rowStep: number
}

const ROW_PADDING = 6
/** how close a label's perpendicular offset must be to another lane's baseline to count as overlapping it */
const OBSTACLE_MARGIN = 12

function rowBlockedByOtherLane(candidate: LabelCandidate, row: number, options: LabelRowOptions): boolean {
  const absOffset = candidate.lane * options.laneHeight + options.baseOffset + row * options.rowStep
  const left = candidate.axisPos - candidate.halfExtent
  const right = candidate.axisPos + candidate.halfExtent
  for (const [lane, intervals] of options.laneOccupancy) {
    if (lane === candidate.lane) continue
    if (Math.abs(absOffset - lane * options.laneHeight) > OBSTACLE_MARGIN) continue
    if (intervals.some((iv) => iv.start <= right && iv.end >= left)) return true
  }
  return false
}

export function assignLabelRows(candidates: LabelCandidate[], maxRows: number, options: LabelRowOptions): LabelPlacement[] {
  // A lane's row-0 offset is `lane*laneHeight + baseOffset`, and each extra row
  // adds `rowStep`. Since laneHeight is a whole multiple of rowStep, every
  // lane's row stack lines up on a shared grid of "levels" spaced `rowStep`
  // apart — level = lane*levelsPerLane + row. Tracking occupancy by *level*
  // instead of by row-index-within-its-own-lane means two labels from
  // *different* lanes that land on the same absolute row (which happens
  // whenever one lane needs enough extra stagger to reach another lane's
  // row-0) are still checked against each other, not just against same-lane
  // neighbors.
  const levelsPerLane = options.laneHeight / options.rowStep
  const sorted = [...candidates].sort((a, b) => a.axisPos - b.axisPos)
  const levelEnds = new Map<number, number>()
  const placements = new Map<string, LabelPlacement>()
  const overflow: LabelCandidate[] = []

  for (const c of sorted) {
    const left = c.axisPos - c.halfExtent
    const startLevel = c.lane * levelsPerLane
    let row = -1
    for (let r = 0; r < maxRows; r++) {
      const level = startLevel + r
      const end = levelEnds.get(level)
      const clearOfOtherLabels = end === undefined || end + ROW_PADDING <= left
      if (clearOfOtherLabels && !rowBlockedByOtherLane(c, r, options)) {
        row = r
        levelEnds.set(level, c.axisPos + c.halfExtent)
        break
      }
    }
    if (row === -1) {
      overflow.push(c)
    } else {
      placements.set(c.id, { id: c.id, row, displayAxisPos: c.axisPos })
    }
  }

  // Pack anything that didn't fit into one extra row, nudging right of the
  // previous overflow item whenever its natural position would overlap.
  let overflowRight = -Infinity
  for (const c of overflow) {
    const naturalLeft = c.axisPos - c.halfExtent
    const left = Math.max(naturalLeft, overflowRight + ROW_PADDING)
    const displayAxisPos = left + c.halfExtent
    overflowRight = left + c.halfExtent * 2
    placements.set(c.id, { id: c.id, row: maxRows, displayAxisPos })
  }

  return sorted.map((c) => placements.get(c.id)!)
}

const measureCache = new Map<string, number>()
let measureCtx: CanvasRenderingContext2D | null | undefined

/** Measure rendered text width in pixels, matching SVG <text> layout closely enough for collision checks. */
export function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily = 'system-ui, "Segoe UI", Roboto, "PingFang TC", "Microsoft JhengHei", sans-serif'
): number {
  const key = `${fontSize}|${fontFamily}|${text}`
  const cached = measureCache.get(key)
  if (cached !== undefined) return cached

  if (measureCtx === undefined) {
    measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  }

  const width = measureCtx
    ? (() => {
        measureCtx!.font = `${fontSize}px ${fontFamily}`
        return measureCtx!.measureText(text).width
      })()
    : text.length * fontSize * 0.9

  measureCache.set(key, width)
  return width
}
