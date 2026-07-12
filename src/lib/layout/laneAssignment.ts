import type { TimelineNode } from "../../types";
import { getNodeSpan } from "../date/historicalDate";

export interface LanedNode {
  node: TimelineNode;
  lane: number;
  start: number;
  end: number;
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
 *
 * When a storyline contains both range and point events, the two types
 * are assigned to separate lane pools: point events always occupy lane 0
 * (innermost), while range events use greedy scheduling starting from
 * lane 1. This prevents a range bar whose endpoint coincides exactly with
 * a point marker from being permanently merged into the same cluster —
 * such events share the same pixel position and can never be separated
 * by zooming, making the point event invisible.
 */
export function assignLanes(nodes: TimelineNode[], minGap = 0.6): LanedNode[] {
  const spans = nodes
    .map((node) => {
      try {
        const [start, end] = getNodeSpan(node);
        return { node, start, end, laneEnd: Math.max(end, start + minGap) };
      } catch {
        return null;
      }
    })
    .filter(
      (
        v,
      ): v is {
        node: TimelineNode;
        start: number;
        end: number;
        laneEnd: number;
      } => v !== null,
    )
    .sort((a, b) => a.start - b.start);

  const hasRange = spans.some((s) => s.node.timeRange !== undefined);
  const hasPoint = spans.some((s) => s.node.timeRange === undefined);

  const result: LanedNode[] = [];

  if (hasRange && hasPoint) {
    // Separate lane pools so range bars and point markers never share a lane.
    // Point events → lane 0 (innermost, closest to the axis).
    for (const span of spans.filter((s) => s.node.timeRange === undefined)) {
      result.push({
        node: span.node,
        lane: 0,
        start: span.start,
        end: span.end,
      });
    }
    // Range events → greedy from lane 1.
    const rangeLaneEnds: number[] = [];
    for (const span of spans.filter((s) => s.node.timeRange !== undefined)) {
      let lane = rangeLaneEnds.findIndex((end) => end <= span.start);
      if (lane === -1) {
        lane = rangeLaneEnds.length;
        rangeLaneEnds.push(span.laneEnd);
      } else {
        rangeLaneEnds[lane] = span.laneEnd;
      }
      result.push({
        node: span.node,
        lane: lane + 1,
        start: span.start,
        end: span.end,
      });
    }
  } else {
    // Homogeneous storyline (all range or all point) — use the original
    // unified greedy assignment.
    const laneEnds: number[] = [];
    for (const span of spans) {
      let lane = laneEnds.findIndex((end) => end <= span.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(span.laneEnd);
      } else {
        laneEnds[lane] = span.laneEnd;
      }
      result.push({ node: span.node, lane, start: span.start, end: span.end });
    }
  }

  return result;
}
