/**
 * Pixel-space collision detection for the markers/bars themselves (not
 * their text labels). Two nodes only get merged into a single "+N"
 * cluster glyph when their rendered footprints (marker circle radius, or
 * bar width) actually overlap on screen — this is the sole trigger for
 * collapsing nodes. Crowded *labels* are handled separately by
 * `labelStagger.ts` and never cause a collapse.
 */

export interface MarkerCandidate {
  id: string
  /** pixel position along the time axis */
  axisPos: number
  /** half of the marker's rendered footprint (radius for points, half bar width for ranges) */
  halfFootprint: number
}

/** Sweep left-to-right merging touching/overlapping footprints into clusters (nodeId -> clusterId, solo nodes absent). */
export function clusterOverlappingMarkers(candidates: MarkerCandidate[]): Map<string, string> {
  const sorted = [...candidates].sort((a, b) => a.axisPos - b.axisPos)
  const clusterOf = new Map<string, string>()
  let clusterIndex = 0
  let members: MarkerCandidate[] = []
  let rightEdge = -Infinity

  const flush = () => {
    if (members.length > 1) {
      const id = `marker-cluster-${clusterIndex++}`
      for (const m of members) clusterOf.set(m.id, id)
    }
    members = []
  }

  for (const c of sorted) {
    const left = c.axisPos - c.halfFootprint
    const right = c.axisPos + c.halfFootprint
    if (members.length > 0 && left <= rightEdge) {
      members.push(c)
      rightEdge = Math.max(rightEdge, right)
    } else {
      flush()
      members = [c]
      rightEdge = right
    }
  }
  flush()

  return clusterOf
}
