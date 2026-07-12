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
}

export interface LabelPlacement {
  id: string
  /** stagger row, 0 = closest to the marker. `maxRows` = the overflow row. */
  row: number
  /** pixel position along the time axis to actually render the label at (may differ from axisPos when nudged in the overflow row) */
  displayAxisPos: number
}

const ROW_PADDING = 6

export function assignLabelRows(candidates: LabelCandidate[], maxRows: number): LabelPlacement[] {
  const sorted = [...candidates].sort((a, b) => a.axisPos - b.axisPos)
  const rowEnds: number[] = []
  const placements = new Map<string, LabelPlacement>()
  const overflow: LabelCandidate[] = []

  for (const c of sorted) {
    const left = c.axisPos - c.halfExtent
    let row = -1
    for (let r = 0; r < maxRows; r++) {
      if (rowEnds[r] === undefined || rowEnds[r] + ROW_PADDING <= left) {
        row = r
        break
      }
    }
    if (row === -1) {
      overflow.push(c)
    } else {
      rowEnds[row] = c.axisPos + c.halfExtent
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
export function measureTextWidth(text: string, fontSize: number, fontFamily = 'sans-serif'): number {
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
