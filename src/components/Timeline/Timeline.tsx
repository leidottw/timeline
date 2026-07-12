import { useEffect, useMemo, useRef, useState } from "react";
import { useTimelineStore } from "../../store/useTimelineStore";
import {
  computeStorylineLayouts,
  totalExtent,
  LABEL_BASE_OFFSET,

  LANE_HEIGHT,
  HOVER_TOOLTIP_GAP,
} from "../../lib/layout/timelineLayout";
import { generateTicks } from "../../lib/layout/ticks";
import { measureTextWidth } from "../../lib/layout/labelStagger";
import { formatYearLabel } from "../../lib/date/historicalDate";
import { nodeMatchesTags } from "../../lib/filter/tagFilter";
import { NodeDetailCard } from "../Node/NodeDetailCard";
import type { Storyline, TimelineNode } from "../../types";

/** fallback axis length before the container has been measured, and the fixed length used in vertical mode */
const DEFAULT_AXIS_LENGTH = 900;
const MIN_AXIS_LENGTH = 400;
const MARGIN_START = 90;
const MARGIN_END = 30;
const AXIS_CROSS_MARGIN = 40;
/** vertical clearance reserved for axis tick labels, so adjacent storyline bands don't overlap them */
const TICK_LABEL_CLEARANCE = 20;

/**
 * Path for a range bar's pill shape, with only the truly-bounded ends
 * rounded — an end that's been clipped to the visible edge gets a flat
 * (square) edge instead, so a rounded cap never gets mistaken for a real
 * start/end point.
 */
function capsuleBarPath(
  xMin: number,
  xMax: number,
  yCenter: number,
  thickness: number,
  roundLeft: boolean,
  roundRight: boolean,
): string {
  const r = thickness / 2;
  const top = yCenter - r;
  const bottom = yCenter + r;
  const leftEdge = roundLeft ? xMin + r : xMin;
  const rightEdge = roundRight ? xMax - r : xMax;
  let d = `M ${leftEdge} ${top} L ${rightEdge} ${top}`;
  d += roundRight
    ? ` A ${r} ${r} 0 0 1 ${rightEdge} ${bottom}`
    : ` L ${xMax} ${bottom}`;
  d += ` L ${leftEdge} ${bottom}`;
  d += roundLeft
    ? ` A ${r} ${r} 0 0 1 ${leftEdge} ${top}`
    : ` L ${xMin} ${top}`;
  d += " Z";
  return d;
}

export function Timeline() {
  const storylines = useTimelineStore((s) => s.storylines);
  const viewportRange = useTimelineStore((s) => s.viewportRange);
  const setViewportRange = useTimelineStore((s) => s.setViewportRange);
  const orientation = useTimelineStore((s) => s.orientation);
  const activeTags = useTimelineStore((s) => s.activeTags);
  const tagMode = useTimelineStore((s) => s.tagMode);
  const focusedNodeId = useTimelineStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useTimelineStore((s) => s.setFocusedNodeId);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    range: typeof viewportRange;
  } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(DEFAULT_AXIS_LENGTH);
  // Node IDs to show when a permanent cluster (same-time points) is clicked.
  const [focusedClusterNodeIds, setFocusedClusterNodeIds] = useState<
    string[] | null
  >(null);

  const isHorizontal = orientation === "horizontal";

  // In horizontal mode the axis should fill the actual available width (not
  // a fixed viewBox size) so it doesn't get letterboxed by the SVG's default
  // aspect-ratio scaling when the page is wider than the fixed length.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setMeasuredWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const axisLength = isHorizontal
    ? Math.max(MIN_AXIS_LENGTH, measuredWidth - MARGIN_START - MARGIN_END)
    : DEFAULT_AXIS_LENGTH;
  const span = viewportRange.end - viewportRange.start || 1;

  function timeToPos(t: number): number {
    const fraction = (t - viewportRange.start) / span;
    return MARGIN_START + fraction * axisLength;
  }

  // Ticks render below the axis in horizontal mode, and to the left in
  // vertical mode — reserve clearance on whichever side that lands on so
  // storyline bands don't render on top of the tick label text.
  const { above, below } = useMemo(
    () =>
      computeStorylineLayouts(storylines, {
        timeToPos,
        isHorizontal,
        aboveReserved: isHorizontal ? 0 : TICK_LABEL_CLEARANCE,
        belowReserved: isHorizontal ? TICK_LABEL_CLEARANCE : 0,
        // keep labels from rendering past the plot edge, where the storyline
        // title (left) or tick labels (right) live
        axisBounds: {
          start: MARGIN_START + 4,
          end: MARGIN_START + axisLength - 4,
        },
        // skip nodes entirely outside the current zoom/pan instead of
        // rendering them (and their leader lines) far off-canvas
        visibleRange: { start: viewportRange.start, end: viewportRange.end },
      }),
    // `timeToPos` is a fresh closure every render, but it's derived purely
    // from `axisLength` and `viewportRange` (already listed below) — depend
    // on axisLength directly rather than on the function identity, which
    // would invalidate every render instead of only when the value actually
    // changes. Missing `axisLength` here previously meant this memo kept
    // using a stale, pre-ResizeObserver axis length on first paint (see
    // MIN_AXIS_LENGTH fallback above) while the SVG itself rendered with the
    // fresh one — the resulting start/end pixel mismatch is what produced
    // the stray diagonal connector lines until the next zoom/pan forced a
    // recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      storylines,
      isHorizontal,
      viewportRange.start,
      viewportRange.end,
      axisLength,
    ],
  );
  const aboveExtent = totalExtent(above);
  const belowExtent = totalExtent(below);
  // The innermost storyline on each side sits right next to the main axis —
  // its own baseline track line is redundant there, so skip drawing it.
  const innermostStorylineIds = new Set(
    [above[0]?.storyline.id, below[0]?.storyline.id].filter(Boolean),
  );

  const crossLength = aboveExtent + belowExtent + AXIS_CROSS_MARGIN * 2;
  const canvasW = isHorizontal
    ? MARGIN_START + axisLength + MARGIN_END
    : crossLength;
  const canvasH = isHorizontal
    ? crossLength
    : MARGIN_START + axisLength + MARGIN_END;

  function point(pos: number, offset: number): { x: number; y: number } {
    const axisCenter = aboveExtent + AXIS_CROSS_MARGIN;
    return isHorizontal
      ? { x: pos, y: axisCenter - offset }
      : { x: axisCenter - offset, y: pos };
  }

  const ticks = generateTicks(viewportRange.start, viewportRange.end);

  function findNodeAndStoryline(
    id: string,
  ): { node: TimelineNode; storyline: Storyline } | null {
    for (const s of storylines) {
      const n = s.nodes.find((n) => n.id === id);
      if (n) return { node: n, storyline: s };
    }
    return null;
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const rect = containerRef.current?.getBoundingClientRect();
    let centerFraction = 0.5;
    if (rect) {
      const localPos = isHorizontal
        ? e.clientX - rect.left
        : e.clientY - rect.top;
      const scale = isHorizontal ? rect.width / canvasW : rect.height / canvasH;
      const svgPos = localPos / scale;
      centerFraction = Math.min(
        1,
        Math.max(0, (svgPos - MARGIN_START) / axisLength),
      );
    }
    // setViewportRange itself clamps the resulting span/position to the
    // store's pan bounds, so no local min/max clamping is needed here.
    const newSpan = span * factor;
    const center = viewportRange.start + span * centerFraction;
    setViewportRange({
      start: center - newSpan * centerFraction,
      end: center + newSpan * (1 - centerFraction),
    });
  }

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      range: viewportRange,
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = isHorizontal ? rect.width / canvasW : rect.height / canvasH;
    const deltaScreen = isHorizontal
      ? e.clientX - dragState.current.startX
      : e.clientY - dragState.current.startY;
    const deltaSvg = deltaScreen / scale;
    const deltaTime =
      -(deltaSvg / axisLength) *
      (dragState.current.range.end - dragState.current.range.start);
    setViewportRange({
      start: dragState.current.range.start + deltaTime,
      end: dragState.current.range.end + deltaTime,
    });
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  const focused = focusedNodeId ? findNodeAndStoryline(focusedNodeId) : null;

  return (
    <div className="relative w-full overflow-x-auto">
      <div
        ref={containerRef}
        className="w-full touch-none select-none"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: "grab" }}
      >
        <svg
          viewBox={`0 0 ${canvasW} ${canvasH}`}
          width="100%"
          height={
            isHorizontal ? Math.min(canvasH, 560) : Math.min(canvasH, 720)
          }
          role="img"
          aria-label="歷史時間軸，顯示各故事線的節點分佈"
        >
          {/* main axis */}
          {isHorizontal ? (
            <line
              x1={MARGIN_START}
              y1={aboveExtent + AXIS_CROSS_MARGIN}
              x2={MARGIN_START + axisLength}
              y2={aboveExtent + AXIS_CROSS_MARGIN}
              stroke="var(--border-stronger, #999)"
              strokeWidth={1.5}
            />
          ) : (
            <line
              x1={aboveExtent + AXIS_CROSS_MARGIN}
              y1={MARGIN_START}
              x2={aboveExtent + AXIS_CROSS_MARGIN}
              y2={MARGIN_START + axisLength}
              stroke="var(--border-stronger, #999)"
              strokeWidth={1.5}
            />
          )}

          {/* ticks */}
          {ticks.map((t) => {
            const pos = timeToPos(t);
            const axisCenter = aboveExtent + AXIS_CROSS_MARGIN;
            return isHorizontal ? (
              <g key={t}>
                <line
                  x1={pos}
                  y1={axisCenter - 4}
                  x2={pos}
                  y2={axisCenter + 4}
                  stroke="#999"
                  strokeWidth={1}
                />
                <text
                  x={pos}
                  y={axisCenter + 18}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#888"
                >
                  {formatYearLabel(t)}
                </text>
              </g>
            ) : (
              <g key={t}>
                <line
                  x1={axisCenter - 4}
                  y1={pos}
                  x2={axisCenter + 4}
                  y2={pos}
                  stroke="#999"
                  strokeWidth={1}
                />
                <text
                  x={axisCenter - 10}
                  y={pos + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="#888"
                >
                  {formatYearLabel(t)}
                </text>
              </g>
            );
          })}

          {/* storylines */}
          {[...above, ...below].map((layout) => {
            const isAbove = layout.storyline.position === "above";
            const laneSign = isAbove ? 1 : -1;
            const trackOffset = layout.baseOffset;

            return (
              <g key={layout.storyline.id}>
                {/* track label */}
                {isHorizontal ? (
                  <text
                    x={MARGIN_START - 14}
                    y={point(0, laneSign * trackOffset).y}
                    textAnchor="end"
                    fontSize={12}
                    fontWeight={500}
                    fill={layout.storyline.color}
                  >
                    {layout.storyline.name}
                  </text>
                ) : (
                  <text
                    x={point(0, laneSign * trackOffset).x}
                    y={MARGIN_START - 12}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={500}
                    fill={layout.storyline.color}
                  >
                    {layout.storyline.name}
                  </text>
                )}

                {/* track base line — the innermost track sits right next to the main axis, so its own line would be redundant */}
                {!innermostStorylineIds.has(layout.storyline.id) &&
                  (isHorizontal ? (
                    <line
                      x1={MARGIN_START}
                      y1={point(0, laneSign * trackOffset).y}
                      x2={MARGIN_START + axisLength}
                      y2={point(0, laneSign * trackOffset).y}
                      stroke={layout.storyline.color}
                      strokeWidth={1}
                      opacity={0.4}
                    />
                  ) : (
                    <line
                      x1={point(0, laneSign * trackOffset).x}
                      y1={MARGIN_START}
                      x2={point(0, laneSign * trackOffset).x}
                      y2={MARGIN_START + axisLength}
                      stroke={layout.storyline.color}
                      strokeWidth={1}
                      opacity={0.4}
                    />
                  ))}

                {/* nodes — markers that visually collide are merged into a cluster badge below, so skip them here */}
                {layout.lanedNodes
                  .filter((n) => !n.clustered)
                  .map(
                    ({
                      node,
                      lane,
                      start,
                      end,
                      labelOffset,
                      labelShift,
                      renderStartPos,
                      renderEndPos,
                    }) => {
                      const matches = nodeMatchesTags(
                        node,
                        activeTags,
                        tagMode,
                      );
                      const opacity = matches ? 1 : 0.15;
                      const isHovered = hoveredNode === node.id;
                      const laneOffset = trackOffset + lane * LANE_HEIGHT;
                      // renderStartPos/renderEndPos are already clamped to the visible plot
                      // area, so a range that runs off-screen is drawn clipped at the edge
                      // instead of stretching (and dragging its leader line) off-canvas.
                      const startPos = renderStartPos;
                      const endPos = renderEndPos;
                      const isRange = node.timeRange !== undefined;
                      const axisPos = (startPos + endPos) / 2;
                      const centerPoint = point(axisPos, laneSign * laneOffset);
                      const p1 = point(startPos, laneSign * laneOffset);
                      const p2 = point(endPos, laneSign * laneOffset);
                      const labelPoint = point(
                        axisPos + labelShift,
                        laneSign * (laneOffset + labelOffset),
                      );
                      const needsLeader =
                        labelOffset > LABEL_BASE_OFFSET || labelShift !== 0;

                      // A range end only counts as "real" if it wasn't clamped to the
                      // visible edge — clipped ends get a flat cap, a fading fill, and
                      // no leader line back to the axis (there's no true point to show).
                      const trueStartPos = timeToPos(start);
                      const trueEndPos = timeToPos(end);
                      const startClipped =
                        isRange && startPos > trueStartPos + 0.5;
                      const endClipped = isRange && endPos < trueEndPos - 0.5;
                      const gradientId = `range-fade-${node.id}`;

                      return (
                        <g
                          key={node.id}
                          opacity={opacity}
                          style={{
                            cursor: matches ? "pointer" : "default",
                            pointerEvents: matches ? "auto" : "none",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFocusedNodeId(node.id);
                            setFocusedClusterNodeIds(null);
                          }}
                          onMouseEnter={() => setHoveredNode(node.id)}
                          onMouseLeave={() =>
                            setHoveredNode((h) => (h === node.id ? null : h))
                          }
                        >
                          {isRange ? (
                            <>
                              {!startClipped && (
                                <line
                                  x1={point(trueStartPos, 0).x}
                                  y1={point(trueStartPos, 0).y}
                                  x2={p1.x}
                                  y2={p1.y}
                                  stroke={layout.storyline.color}
                                  strokeWidth={1}
                                  strokeDasharray="2,2"
                                  opacity={0.6}
                                />
                              )}
                              {!endClipped && (
                                <line
                                  x1={point(trueEndPos, 0).x}
                                  y1={point(trueEndPos, 0).y}
                                  x2={p2.x}
                                  y2={p2.y}
                                  stroke={layout.storyline.color}
                                  strokeWidth={1}
                                  strokeDasharray="2,2"
                                  opacity={0.6}
                                />
                              )}
                            </>
                          ) : (
                            <line
                              x1={point(startPos, 0).x}
                              y1={point(startPos, 0).y}
                              x2={centerPoint.x}
                              y2={centerPoint.y}
                              stroke={layout.storyline.color}
                              strokeWidth={1}
                              strokeDasharray="2,2"
                              opacity={0.6}
                            />
                          )}

                          {isRange ? (
                            isHorizontal ? (
                              <>
                                {(startClipped || endClipped) && (
                                  <defs>
                                    <linearGradient
                                      id={gradientId}
                                      x1="0"
                                      y1="0"
                                      x2="1"
                                      y2="0"
                                    >
                                      <stop
                                        offset="0%"
                                        stopColor={layout.storyline.color}
                                        stopOpacity={startClipped ? 0.25 : 1}
                                      />
                                      <stop
                                        offset={startClipped ? "15%" : "0%"}
                                        stopColor={layout.storyline.color}
                                        stopOpacity={1}
                                      />
                                      <stop
                                        offset={endClipped ? "85%" : "100%"}
                                        stopColor={layout.storyline.color}
                                        stopOpacity={1}
                                      />
                                      <stop
                                        offset="100%"
                                        stopColor={layout.storyline.color}
                                        stopOpacity={endClipped ? 0.25 : 1}
                                      />
                                    </linearGradient>
                                  </defs>
                                )}
                                <path
                                  d={capsuleBarPath(
                                    Math.min(p1.x, p2.x),
                                    Math.max(
                                      Math.min(p1.x, p2.x) + 8,
                                      Math.max(p1.x, p2.x),
                                    ),
                                    p1.y,
                                    8,
                                    !startClipped,
                                    !endClipped,
                                  )}
                                  fill={
                                    startClipped || endClipped
                                      ? `url(#${gradientId})`
                                      : layout.storyline.color
                                  }
                                  stroke={isHovered ? "#000" : "#0006"}
                                  strokeWidth={isHovered ? 1.5 : 0.5}
                                />
                              </>
                            ) : (
                              <rect
                                x={p1.x - 4}
                                y={Math.min(p1.y, p2.y)}
                                width={8}
                                height={Math.max(Math.abs(p2.y - p1.y), 8)}
                                rx={4}
                                fill={layout.storyline.color}
                                stroke={isHovered ? "#000" : "#0006"}
                                strokeWidth={isHovered ? 1.5 : 0.5}
                              />
                            )
                          ) : (
                            <circle
                              cx={centerPoint.x}
                              cy={centerPoint.y}
                              r={isHovered ? 4.5 : 3.5}
                              fill="none"
                              stroke={layout.storyline.color}
                              strokeWidth={isHovered ? 2.5 : 1.75}
                            />
                          )}

                          {needsLeader && (
                            <line
                              x1={centerPoint.x}
                              y1={centerPoint.y}
                              x2={labelPoint.x}
                              y2={labelPoint.y}
                              stroke={layout.storyline.color}
                              strokeWidth={isHovered ? 1.25 : 0.75}
                              strokeDasharray="1,2"
                              opacity={isHovered ? 0.9 : 0.5}
                            />
                          )}
                          <text
                            x={labelPoint.x}
                            y={labelPoint.y}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={isHovered ? 700 : 400}
                            fill={isHovered ? "#000" : "#333"}
                          >
                            {node.title}
                          </text>
                        </g>
                      );
                    },
                  )}

                {/* marker clusters — nodes whose markers genuinely overlap on screen */}
                {layout.clusters.map((cluster) => {
                  const axisPos = Math.min(
                    Math.max(timeToPos(cluster.center), MARGIN_START),
                    MARGIN_START + axisLength,
                  );
                  const clusterLaneOffset =
                    trackOffset + cluster.lane * LANE_HEIGHT;
                  const badgePoint = point(
                    axisPos,
                    laneSign * clusterLaneOffset,
                  );

                  if (cluster.permanent) {
                    // All members share the exact same time — zooming can never separate them.
                    // Render a real point marker, show only the first node's label with a
                    // superscript count at its top-right, and open all detail cards on click.
                    const memberNodes = cluster.nodeIds
                      .map((id) =>
                        layout.lanedNodes.find((n) => n.node.id === id),
                      )
                      .filter(
                        (n): n is (typeof layout.lanedNodes)[number] =>
                          n !== undefined,
                      );
                    if (memberNodes.length === 0) return null;
                    const firstNode = memberNodes[0];
                    const axisPoint = point(axisPos, 0);
                    const labelPoint = point(
                      axisPos,
                      laneSign * (clusterLaneOffset + LABEL_BASE_OFFSET),
                    );
                    const titleWidth = measureTextWidth(
                      firstNode.node.title,
                      10,
                    );
                    return (
                      <g
                        key={cluster.id}
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusedNodeId(null);
                          setFocusedClusterNodeIds(cluster.nodeIds);
                        }}
                      >
                        {/* connector from axis to marker */}
                        <line
                          x1={axisPoint.x}
                          y1={axisPoint.y}
                          x2={badgePoint.x}
                          y2={badgePoint.y}
                          stroke={layout.storyline.color}
                          strokeWidth={1}
                          strokeDasharray="2,2"
                          opacity={0.6}
                        />
                        {/* point marker */}
                        <circle
                          cx={badgePoint.x}
                          cy={badgePoint.y}
                          r={3.5}
                          fill="none"
                          stroke={layout.storyline.color}
                          strokeWidth={1.75}
                        />
                        {/* first node's label */}
                        <text
                          x={labelPoint.x}
                          y={labelPoint.y}
                          textAnchor="middle"
                          fontSize={10}
                          fill="#333"
                        >
                          {firstNode.node.title}
                        </text>
                        {/* superscript count at top-right of the label */}
                        <text
                          x={labelPoint.x + titleWidth / 2 + 2}
                          y={labelPoint.y - 5}
                          fontSize={7}
                          fontWeight={700}
                          fill={layout.storyline.color}
                        >
                          {cluster.nodeIds.length}
                        </text>
                      </g>
                    );
                  }

                  // Separable cluster — click to zoom in and let them spread apart.
                  const pad = Math.max((cluster.end - cluster.start) * 0.4, 1);
                  return (
                    <g
                      key={cluster.id}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewportRange({
                          start: cluster.start - pad,
                          end: cluster.end + pad,
                        });
                      }}
                    >
                      <circle
                        cx={badgePoint.x}
                        cy={badgePoint.y}
                        r={9}
                        fill="#fff"
                        stroke={layout.storyline.color}
                        strokeWidth={1.5}
                      />
                      <text
                        x={badgePoint.x}
                        y={badgePoint.y + 3}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight={600}
                        fill={layout.storyline.color}
                      >
                        +{cluster.nodeIds.length}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* hover tooltip — rendered last (on top of every node) with an opaque
              background so it stays legible no matter what it lands on */}
          {hoveredNode &&
            (() => {
              for (const layout of [...above, ...below]) {
                const found = layout.lanedNodes.find(
                  (n) => !n.clustered && n.node.id === hoveredNode,
                );
                if (!found) continue;
                const laneSign = layout.storyline.position === "above" ? 1 : -1;
                const laneOffset = layout.baseOffset + found.lane * LANE_HEIGHT;
                const axisPos = (found.renderStartPos + found.renderEndPos) / 2;
                const tooltipPoint = point(
                  axisPos + found.labelShift,
                  laneSign *
                    (laneOffset + found.labelOffset + HOVER_TOOLTIP_GAP),
                );
                const tooltipText = found.node.timeRange
                  ? `${formatYearLabel(found.start)} – ${formatYearLabel(found.end)}`
                  : formatYearLabel(found.start);
                const textWidth = measureTextWidth(tooltipText, 9);
                return (
                  <g key="hover-tooltip" style={{ pointerEvents: "none" }}>
                    <rect
                      x={tooltipPoint.x - textWidth / 2 - 4}
                      y={tooltipPoint.y - 10}
                      width={textWidth + 8}
                      height={14}
                      rx={3}
                      fill="#fff"
                      stroke="#0002"
                      strokeWidth={1}
                    />
                    <text
                      x={tooltipPoint.x}
                      y={tooltipPoint.y}
                      textAnchor="middle"
                      fontSize={9}
                      fill="#333"
                    >
                      {tooltipText}
                    </text>
                  </g>
                );
              }
              return null;
            })()}
        </svg>
      </div>

      {focusedClusterNodeIds ? (
        <div className="mt-3 flex justify-end flex-wrap gap-2">
          {focusedClusterNodeIds.map((id) => {
            const found = findNodeAndStoryline(id);
            if (!found) return null;
            return (
              <NodeDetailCard
                key={id}
                node={found.node}
                storyline={found.storyline}
                onClose={() => setFocusedClusterNodeIds(null)}
              />
            );
          })}
        </div>
      ) : focused ? (
        <div className="mt-3 flex justify-end">
          <NodeDetailCard node={focused.node} storyline={focused.storyline} />
        </div>
      ) : null}
    </div>
  );
}
