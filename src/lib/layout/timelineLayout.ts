import type { DisplayDensity, Storyline } from "../../types";
import { assignLanes, type LanedNode } from "./laneAssignment";
import {
  assignLabelRows,
  measureTextWidth,
  type LaneObstacle,
} from "./labelStagger";
import { clusterOverlappingMarkers } from "./markerCluster";

export interface LayoutedNode extends LanedNode {
  /** true when this node's marker visually overlaps a neighbor and is represented by a cluster badge instead */
  clustered: boolean;
  /** perpendicular pixel offset from the track baseline for this node's label (unused when clustered) */
  labelOffset: number;
  /** pixel offset along the time axis applied to the label when it had to be nudged clear of neighbors (0 = no nudge) */
  labelShift: number;
  /** pixel start/end along the time axis, clamped to the visible plot area — use these (not `start`/`end`) for marker/bar rendering so partially-visible ranges are clipped at the edge instead of drawn off-canvas */
  renderStartPos: number;
  renderEndPos: number;
}

export interface MarkerCluster {
  id: string;
  nodeIds: string[];
  lane: number;
  /** midpoint time (in the same units as node start/end) to center the badge and zoom target on */
  center: number;
  start: number;
  end: number;
  /**
   * true when every member node is a point event with the exact same time —
   * no zoom level can spread them apart, so the "+N" zoom-to-expand badge is
   * replaced by an inline stacked-label display instead.
   */
  permanent: boolean;
}

export interface StorylineLayout {
  storyline: Storyline;
  /** distance in px from the main axis to this storyline's baseline lane */
  baseOffset: number;
  bandHeight: number;
  lanedNodes: LayoutedNode[];
  clusters: MarkerCluster[];
}

// Lane spacing is kept a whole multiple of the row step (levelsPerLane must
// stay an integer — see labelStagger.ts) so a label staggered a couple of
// rows out from its own lane still lands with real clearance before the
// next lane, not just barely-not-touching it.
export interface TimelineMetrics {
  laneHeight: number;
  minBand: number;
  bandGap: number;
  labelFontSize: number;
  labelBaseOffset: number;
  labelRowStep: number;
  hoverTooltipGap: number;
  markerHalfFootprint: number;
  minBarHalfWidth: number;
  tickFontSize: number;
  storylineFontSize: number;
  tooltipFontSize: number;
  clusterFontSize: number;
  superscriptFontSize: number;
}

export const TIMELINE_METRICS: Record<DisplayDensity, TimelineMetrics> = {
  comfortable: {
    laneHeight: 52,
    minBand: 44,
    bandGap: 18,
    labelFontSize: 12,
    labelBaseOffset: 20,
    labelRowStep: 26,
    hoverTooltipGap: 18,
    markerHalfFootprint: 8,
    minBarHalfWidth: 5,
    tickFontSize: 13,
    storylineFontSize: 14,
    tooltipFontSize: 12,
    clusterFontSize: 11,
    superscriptFontSize: 9,
  },
  compact: {
    laneHeight: 44,
    minBand: 36,
    bandGap: 14,
    labelFontSize: 10,
    labelBaseOffset: 16,
    labelRowStep: 22,
    hoverTooltipGap: 14,
    markerHalfFootprint: 7,
    minBarHalfWidth: 4,
    tickFontSize: 11,
    storylineFontSize: 12,
    tooltipFontSize: 9,
    clusterFontSize: 9,
    superscriptFontSize: 7,
  },
};

export interface LayoutOptions {
  /** projects a time value to a pixel position along the time axis at the current zoom/pan */
  timeToPos: (t: number) => number;
  isHorizontal: boolean;
  metrics: TimelineMetrics;
  /** extra clearance to reserve before the first "above" band (e.g. tick labels in vertical mode) */
  aboveReserved?: number;
  /** extra clearance to reserve before the first "below" band (e.g. tick labels in horizontal mode) */
  belowReserved?: number;
  /** pixel range (along the time axis) labels must stay within, so they never render past the plot edge into the storyline title or tick-label margins */
  axisBounds?: { start: number; end: number };
  /** current viewport's visible time range (same units as node start/end) — nodes entirely outside it are skipped instead of rendering far off-canvas */
  visibleRange?: { start: number; end: number };
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
  options: LayoutOptions,
): { above: StorylineLayout[]; below: StorylineLayout[] } {
  const build = (list: Storyline[], reserved: number) => {
    const metrics = options.metrics;
    const sorted = [...list].sort((a, b) => a.order - b.order);
    let cumulative = metrics.bandGap + reserved;
    const layouts: StorylineLayout[] = [];
    for (const storyline of sorted) {
      // Lanes are assigned over the storyline's *entire* node list, not just
      // the currently-visible ones — lane assignment is a pure function of
      // each node's own time span, so it must stay stable as the viewport
      // pans. Filtering to "visible" first would make the lane a node lands
      // in depend on which *other* nodes happen to be in view at that exact
      // pan position (an off-screen node scrolling into view could "steal" a
      // lane slot from one that's been sitting there for several frames),
      // which is what caused nodes to flicker between a merged "+N" badge
      // and their real bars while panning.
      const allLaned = assignLanes(storyline.nodes);
      const laned = options.visibleRange
        ? allLaned.filter(
            (n) =>
              n.end >= options.visibleRange!.start &&
              n.start <= options.visibleRange!.end,
          )
        : allLaned;
      const laneCount = Math.max(1, ...laned.map((n) => n.lane + 1));

      // Pixel start/end, clipped to the visible plot area, computed once so
      // label collision and rendering agree on what's actually on screen —
      // a range that runs off the right edge should be treated (and drawn)
      // as ending at the edge, not at its true off-canvas end. Marker-vs-
      // marker clustering (pass 1, below) deliberately does NOT use these —
      // it needs the true unclamped positions, since the clamp has a kink
      // exactly at the viewport edge: as a bar's visible portion grows or
      // shrinks while panning/zooming across that edge, the clamped
      // footprint jumps non-continuously, which flipped cluster/no-cluster
      // decisions unstably (nodes flickering between a merged "+N" badge and
      // their real bars while panning).
      const bounds = options.axisBounds;
      const renderPosById = new Map<
        string,
        { start: number; end: number; rawStart: number; rawEnd: number }
      >();
      for (const n of laned) {
        const rawStart = options.timeToPos(n.start);
        const rawEnd = options.timeToPos(n.end);
        renderPosById.set(n.node.id, {
          start: bounds ? Math.max(rawStart, bounds.start) : rawStart,
          end: bounds ? Math.min(rawEnd, bounds.end) : rawEnd,
          rawStart,
          rawEnd,
        });
      }

      // --- pass 1: marker-vs-marker pixel collision, per lane ---
      // Also records each node's pixel footprint per lane as a "lane
      // occupancy" map — pass 2 uses this so a label staggered out from its
      // own lane never climbs high enough to land on another lane's marker/bar.
      const byLane = new Map<number, LanedNode[]>();
      for (const n of laned) {
        const arr = byLane.get(n.lane) ?? [];
        arr.push(n);
        byLane.set(n.lane, arr);
      }
      const clusterOf = new Map<string, string>();
      const laneOccupancy = new Map<number, LaneObstacle[]>();
      for (const [lane, laneNodes] of byLane) {
        const candidates = laneNodes.map((n) => {
          const { rawStart: startPos, rawEnd: endPos } = renderPosById.get(
            n.node.id,
          )!;
          const isRange = n.node.timeRange !== undefined;
          const halfFootprint = isRange
            ? Math.max(Math.abs(endPos - startPos), metrics.minBarHalfWidth * 2) / 2
            : metrics.markerHalfFootprint;
          return {
            id: n.node.id,
            axisPos: (startPos + endPos) / 2,
            halfFootprint,
          };
        });
        laneOccupancy.set(
          lane,
          candidates.map((c) => ({
            start: c.axisPos - c.halfFootprint,
            end: c.axisPos + c.halfFootprint,
          })),
        );
        for (const [id, clusterId] of clusterOverlappingMarkers(candidates)) {
          clusterOf.set(id, clusterId);
        }
      }

      // --- pass 2: label-vs-label AND label-vs-other-lane pixel collision, among non-clustered nodes only ---
      const soloNodes = laned.filter((n) => !clusterOf.has(n.node.id));
      const labelCandidates = soloNodes.map((n) => {
        const { start: startPos, end: endPos } = renderPosById.get(n.node.id)!;
        const axisPos = (startPos + endPos) / 2;
        const halfExtent = options.isHorizontal
          ? measureTextWidth(n.node.title, metrics.labelFontSize) / 2 + 4
          : metrics.labelFontSize / 2 + 4;
        return { id: n.node.id, axisPos, halfExtent, lane: n.lane };
      });
      // No fixed cap on stagger rows — a dense cluster grows the band taller
      // rather than being forced into the horizontal-nudge overflow row.
      // Bounded by candidate count as a safety ceiling (a label can never
      // need more rows than there are labels to collide with).
      const maxLabelRows = Math.max(1, labelCandidates.length);
      const placements = assignLabelRows(labelCandidates, maxLabelRows, {
        laneOccupancy,
        laneHeight: metrics.laneHeight,
        baseOffset: metrics.labelBaseOffset,
        rowStep: metrics.labelRowStep,
      });
      const placementById = new Map(placements.map((p) => [p.id, p]));
      const halfExtentById = new Map(
        labelCandidates.map((c) => [c.id, c.halfExtent]),
      );

      let maxRowUsed = 0;
      const lanedNodes: LayoutedNode[] = laned.map((n) => {
        const clustered = clusterOf.has(n.node.id);
        const p = placementById.get(n.node.id);
        if (p) maxRowUsed = Math.max(maxRowUsed, Math.min(p.row, maxLabelRows));
        const { start: renderStartPos, end: renderEndPos } = renderPosById.get(
          n.node.id,
        )!;
        const axisPos = (renderStartPos + renderEndPos) / 2;
        let displayAxisPos = p ? p.displayAxisPos : axisPos;
        if (bounds) {
          const halfExtent = halfExtentById.get(n.node.id) ?? 0;
          displayAxisPos = Math.min(
            Math.max(displayAxisPos, bounds.start + halfExtent),
            bounds.end - halfExtent,
          );
        }
        return {
          ...n,
          clustered,
          labelOffset: metrics.labelBaseOffset + (p ? p.row : 0) * metrics.labelRowStep,
          labelShift: displayAxisPos - axisPos,
          renderStartPos,
          renderEndPos,
        };
      });

      const clusters = buildClusters(laned, clusterOf);
      // Reserve room for the hover tooltip beyond the outermost used row too,
      // so hovering the furthest-staggered label doesn't poke into whatever
      // comes after this band.
      const labelSpace =
        metrics.labelBaseOffset +
        maxRowUsed * metrics.labelRowStep +
        metrics.labelFontSize +
        metrics.hoverTooltipGap +
        10;
      // Permanent clusters render only the first node's label, so reserve
      // space for one label per cluster (excluded from the normal stagger pass).
      const maxPermClusterSpace = clusters
        .filter((c) => c.permanent)
        .reduce((max, c) => {
          const depth =
            c.lane * metrics.laneHeight +
            metrics.labelBaseOffset +
            metrics.labelFontSize +
            metrics.hoverTooltipGap +
            10;
          return Math.max(max, depth);
        }, 0);
      const bandHeight = Math.max(
        metrics.minBand,
        laneCount * metrics.laneHeight,
        labelSpace,
        maxPermClusterSpace,
      );

      layouts.push({
        storyline,
        baseOffset: cumulative,
        bandHeight,
        lanedNodes,
        clusters,
      });
      cumulative += bandHeight + metrics.bandGap;
    }
    return layouts;
  };

  return {
    above: build(
      storylines.filter((s) => s.position === "above"),
      options.aboveReserved ?? 0,
    ),
    below: build(
      storylines.filter((s) => s.position === "below"),
      options.belowReserved ?? 0,
    ),
  };
}

function buildClusters(
  laned: LanedNode[],
  clusterOf: Map<string, string>,
): MarkerCluster[] {
  const byCluster = new Map<string, LanedNode[]>();
  for (const n of laned) {
    const clusterId = clusterOf.get(n.node.id);
    if (!clusterId) continue;
    const arr = byCluster.get(clusterId) ?? [];
    arr.push(n);
    byCluster.set(clusterId, arr);
  }
  return [...byCluster.entries()].map(([id, nodes]) => {
    const start = Math.min(...nodes.map((n) => n.start));
    const end = Math.max(...nodes.map((n) => n.end));
    // A cluster is permanent when every member is a point event at the exact
    // same time — they always occupy the same pixel regardless of zoom level,
    // so the zoom-to-expand interaction can never separate them.
    const permanent = nodes.every(
      (n) => n.node.timeRange === undefined && n.start === nodes[0].start,
    );
    return {
      id,
      nodeIds: nodes.map((n) => n.node.id),
      lane: nodes[0].lane,
      center: (start + end) / 2,
      start,
      end,
      permanent,
    };
  });
}

export function totalExtent(layouts: StorylineLayout[]): number {
  if (layouts.length === 0) return 40;
  const last = layouts[layouts.length - 1];
  return last.baseOffset + last.bandHeight + 20;
}
