import { useEffect, useMemo, useRef, useState } from "react";
import { useTimelineStore } from "../../store/useTimelineStore";
import {
  computeStorylineLayouts,
  totalExtent,
  TIMELINE_METRICS,
} from "../../lib/layout/timelineLayout";
import { generateTicks } from "../../lib/layout/ticks";
import { measureTextWidth } from "../../lib/layout/labelStagger";
import {
  formatHistoricalDate,
  formatTimelineTick,
} from "../../lib/date/historicalDate";
import { nodeMatchesTags } from "../../lib/filter/tagFilter";
import {
  clampCanvasOffset,
  clampViewportRange,
  panViewportRange,
  zoomViewportRange,
} from "../../lib/viewport/range";
import { NodeDetailCard } from "../Node/NodeDetailCard";
import type {
  Storyline,
  TimelineNode,
  ViewportRange,
  WorkspaceMode,
} from "../../types";

/** fallback axis length before the container has been measured */
const DEFAULT_AXIS_LENGTH = 900;
const MIN_AXIS_LENGTH = 400;

function truncateTextToWidth(
  text: string,
  maxWidth: number,
  fontSize: number,
): string {
  if (measureTextWidth(text, fontSize) <= maxWidth) return text;

  const characters = Array.from(text);
  const ellipsis = "…";
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${characters.slice(0, middle).join("")}${ellipsis}`;
    if (measureTextWidth(candidate, fontSize) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${characters.slice(0, low).join("")}${ellipsis}`;
}

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

export function Timeline({
  mode,
  selectedNodeId,
  focusRequest,
  onSelectNode,
}: {
  mode: WorkspaceMode;
  selectedNodeId: string | null;
  focusRequest: { nodeId: string; version: number };
  onSelectNode: (storylineId: string, nodeId: string) => void;
}) {
  const storylines = useTimelineStore((s) => s.storylines);
  const viewportRange = useTimelineStore((s) => s.viewportRange);
  const panBounds = useTimelineStore((s) => s.panBounds);
  const setViewportRange = useTimelineStore((s) => s.setViewportRange);
  const animateViewportRange = useTimelineStore((s) => s.animateViewportRange);
  const viewportAnimationVersion = useTimelineStore(
    (s) => s.viewportAnimationVersion,
  );
  const displayDensity = useTimelineStore((s) => s.displayDensity);
  const hiddenStorylineIds = useTimelineStore((s) => s.hiddenStorylineIds);
  const toggleStorylineVisibility = useTimelineStore(
    (s) => s.toggleStorylineVisibility,
  );
  const canvasResetVersion = useTimelineStore((s) => s.canvasResetVersion);
  const activeTags = useTimelineStore((s) => s.activeTags);
  const tagMode = useTimelineStore((s) => s.tagMode);
  const focusedNodeId = useTimelineStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useTimelineStore((s) => s.setFocusedNodeId);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    range: ViewportRange;
    crossOffset: number;
  } | null>(null);
  const dragFrame = useRef<number | null>(null);
  const pendingDragRange = useRef<ViewportRange | null>(null);
  const pendingCrossOffset = useRef<number | null>(null);
  const viewportAnimationFrame = useRef<number | null>(null);
  const renderedViewportRangeRef = useRef(viewportRange);
  const lastViewportAnimationVersion = useRef(viewportAnimationVersion);
  const appliedFocusVersion = useRef(-1);
  const appliedNodeFocusVersion = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [renderedViewportRange, setRenderedViewportRange] =
    useState(viewportRange);
  const [crossOffset, setCrossOffset] = useState(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(DEFAULT_AXIS_LENGTH);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  // Node IDs to show when a permanent cluster (same-time points) is clicked.
  const [focusedClusterNodeIds, setFocusedClusterNodeIds] = useState<
    string[] | null
  >(null);

  const metrics = TIMELINE_METRICS[displayDensity];
  const baseMarginStart = displayDensity === "comfortable" ? 110 : 90;
  const widestStorylineLabel = useMemo(
    () =>
      Math.max(
        0,
        ...storylines.map((storyline) =>
          measureTextWidth(storyline.name, metrics.storylineFontSize),
        ),
      ),
    [metrics.storylineFontSize, storylines],
  );
  const storylineLabelMaxWidth = Math.max(
    48,
    Math.min(widestStorylineLabel, 240, measuredWidth * 0.3),
  );
  const marginStart = Math.max(
    baseMarginStart,
    Math.ceil(storylineLabelMaxWidth + 38),
  );
  const marginEnd = displayDensity === "comfortable" ? 36 : 30;
  const axisCrossMargin = displayDensity === "comfortable" ? 48 : 40;
  const crossPanPadding = displayDensity === "comfortable" ? 48 : 40;
  const tickLabelClearance = displayDensity === "comfortable" ? 26 : 20;
  const visibleStorylines = useMemo(
    () =>
      storylines.filter(
        (storyline) => !hiddenStorylineIds.includes(storyline.id),
      ),
    [hiddenStorylineIds, storylines],
  );

  // In horizontal mode the axis should fill the actual available width (not
  // a fixed viewBox size) so it doesn't get letterboxed by the SVG's default
  // aspect-ratio scaling when the page is wider than the fixed length.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      const height = entries[0]?.contentRect.height;
      if (width) setMeasuredWidth(width);
      if (height) setMeasuredHeight(height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
      if (viewportAnimationFrame.current !== null) {
        cancelAnimationFrame(viewportAnimationFrame.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (viewportAnimationFrame.current !== null) {
      cancelAnimationFrame(viewportAnimationFrame.current);
      viewportAnimationFrame.current = null;
    }

    const target = {
      start: viewportRange.start,
      end: viewportRange.end,
    };
    const shouldAnimate =
      lastViewportAnimationVersion.current !== viewportAnimationVersion &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    lastViewportAnimationVersion.current = viewportAnimationVersion;

    if (!shouldAnimate) {
      renderedViewportRangeRef.current = target;
      setRenderedViewportRange(target);
      return;
    }

    const start = renderedViewportRangeRef.current;
    const startedAt = performance.now();
    const duration = 300;

    function animate(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      const next = {
        start: start.start + (target.start - start.start) * eased,
        end: start.end + (target.end - start.end) * eased,
      };
      renderedViewportRangeRef.current = next;
      setRenderedViewportRange(next);

      if (progress < 1) {
        viewportAnimationFrame.current = requestAnimationFrame(animate);
      } else {
        viewportAnimationFrame.current = null;
      }
    }

    viewportAnimationFrame.current = requestAnimationFrame(animate);
    return () => {
      if (viewportAnimationFrame.current !== null) {
        cancelAnimationFrame(viewportAnimationFrame.current);
        viewportAnimationFrame.current = null;
      }
    };
  }, [
    viewportAnimationVersion,
    viewportRange.end,
    viewportRange.start,
  ]);

  const axisLength = Math.max(
    MIN_AXIS_LENGTH,
    measuredWidth - marginStart - marginEnd,
  );
  const span =
    renderedViewportRange.end - renderedViewportRange.start || 1;

  function timeToPos(t: number): number {
    const fraction = (t - renderedViewportRange.start) / span;
    return marginStart + fraction * axisLength;
  }

  // Reserve room below the axis so storyline bands do not overlap tick labels.
  const { above, below } = useMemo(
    () =>
      computeStorylineLayouts(visibleStorylines, {
        timeToPos,
        isHorizontal: true,
        metrics,
        aboveReserved: 0,
        belowReserved: tickLabelClearance,
        // keep labels from rendering past the plot edge, where the storyline
        // title (left) or tick labels (right) live
        axisBounds: {
          start: marginStart + 4,
          end: marginStart + axisLength - 4,
        },
        // skip nodes entirely outside the current zoom/pan instead of
        // rendering them (and their leader lines) far off-canvas
        visibleRange: {
          start: renderedViewportRange.start,
          end: renderedViewportRange.end,
        },
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
      visibleStorylines,
      renderedViewportRange.start,
      renderedViewportRange.end,
      axisLength,
      metrics,
      marginStart,
      tickLabelClearance,
    ],
  );
  const aboveExtent = totalExtent(above);
  const belowExtent = totalExtent(below);
  // The innermost storyline on each side sits right next to the main axis —
  // its own baseline track line is redundant there, so skip drawing it.
  const innermostStorylineIds = new Set(
    [above[0]?.storyline.id, below[0]?.storyline.id].filter(Boolean),
  );

  const crossLength = aboveExtent + belowExtent + axisCrossMargin * 2;
  const canvasW = marginStart + axisLength + marginEnd;
  const canvasH = crossLength;

  useEffect(() => {
    if (
      measuredHeight <= 0 ||
      appliedFocusVersion.current === canvasResetVersion
    ) {
      return;
    }
    setCrossOffset(Math.round((measuredHeight - canvasH) / 2));
    appliedFocusVersion.current = canvasResetVersion;
  }, [canvasH, canvasResetVersion, measuredHeight]);

  useEffect(() => {
    setCrossOffset((offset) =>
      clampCanvasOffset(
        offset,
        measuredHeight,
        canvasH,
        crossPanPadding,
      ),
    );
  }, [canvasH, crossPanPadding, measuredHeight]);

  useEffect(() => {
    if (
      mode !== "edit" ||
      focusRequest.version === 0 ||
      appliedNodeFocusVersion.current === focusRequest.version ||
      measuredHeight <= 0
    ) {
      return;
    }

    for (const layout of [...above, ...below]) {
      const focusedNode = layout.lanedNodes.find(
        (item) => item.node.id === focusRequest.nodeId,
      );
      if (!focusedNode) continue;
      const laneSign = layout.storyline.position === "above" ? 1 : -1;
      const nodeY =
        aboveExtent +
        axisCrossMargin -
        laneSign * (layout.baseOffset + focusedNode.lane * metrics.laneHeight);
      setCrossOffset(
        clampCanvasOffset(
          measuredHeight / 2 - nodeY,
          measuredHeight,
          canvasH,
          crossPanPadding,
        ),
      );
      appliedNodeFocusVersion.current = focusRequest.version;
      break;
    }
  }, [
    above,
    aboveExtent,
    axisCrossMargin,
    below,
    canvasH,
    crossPanPadding,
    focusRequest,
    measuredHeight,
    metrics.laneHeight,
    mode,
  ]);

  function point(pos: number, offset: number): { x: number; y: number } {
    const axisCenter = aboveExtent + axisCrossMargin;
    return { x: pos, y: axisCenter - offset };
  }

  const ticks = generateTicks(
    renderedViewportRange.start,
    renderedViewportRange.end,
  );

  function findNodeAndStoryline(
    id: string,
  ): { node: TimelineNode; storyline: Storyline } | null {
    for (const s of storylines) {
      const n = s.nodes.find((n) => n.id === id);
      if (n) return { node: n, storyline: s };
    }
    return null;
  }

  function activateNode(storylineId: string, nodeId: string) {
    setFocusedClusterNodeIds(null);
    if (mode === "edit") {
      setFocusedNodeId(null);
      onSelectNode(storylineId, nodeId);
    } else {
      setFocusedNodeId(nodeId);
    }
  }

  useEffect(() => {
    if (mode !== "edit") return;
    setFocusedNodeId(null);
    setFocusedClusterNodeIds(null);
  }, [mode, setFocusedNodeId]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      event.stopPropagation();

      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
      const deltaX = event.deltaX * unit;
      const deltaY = event.deltaY * unit;

      if (event.ctrlKey || event.metaKey) {
        const normalizedDelta = deltaY || deltaX;
        const factor = Math.exp(
          Math.min(1, Math.max(-1, normalizedDelta * 0.002)),
        );
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const svgPos = (event.clientX - rect.left) / (rect.width / canvasW);
        const centerFraction = Math.min(
          1,
          Math.max(0, (svgPos - marginStart) / axisLength),
        );
        if (viewportAnimationFrame.current !== null) {
          cancelAnimationFrame(viewportAnimationFrame.current);
          viewportAnimationFrame.current = null;
        }
        const nextRange = clampViewportRange(
          zoomViewportRange(
            renderedViewportRangeRef.current,
            factor,
            centerFraction,
          ),
          panBounds,
        );
        renderedViewportRangeRef.current = nextRange;
        setRenderedViewportRange(nextRange);
        setViewportRange(nextRange);
        return;
      }

      // Trackpad horizontal gestures (or Shift + a mouse wheel) move through
      // time. A regular vertical wheel moves the canvas cross-axis instead of
      // bubbling to the document and creating a root scrollbar.
      const timeDelta = event.shiftKey ? deltaY || deltaX : deltaX;
      const crossDelta = event.shiftKey ? 0 : deltaY;
      if (timeDelta) {
        if (viewportAnimationFrame.current !== null) {
          cancelAnimationFrame(viewportAnimationFrame.current);
          viewportAnimationFrame.current = null;
        }
        const nextRange = clampViewportRange(
          panViewportRange(
            renderedViewportRangeRef.current,
            timeDelta / axisLength,
          ),
          panBounds,
        );
        renderedViewportRangeRef.current = nextRange;
        setRenderedViewportRange(nextRange);
        setViewportRange(nextRange);
      }
      if (crossDelta) {
        setCrossOffset((offset) =>
          clampCanvasOffset(
            offset - crossDelta,
            measuredHeight,
            canvasH,
            crossPanPadding,
          ),
        );
      }
    }

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [
    axisLength,
    canvasH,
    canvasW,
    crossPanPadding,
    marginStart,
    measuredHeight,
    panBounds,
    setViewportRange,
  ]);

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as Element).closest("[data-timeline-action]")) return;
    if (viewportAnimationFrame.current !== null) {
      cancelAnimationFrame(viewportAnimationFrame.current);
      viewportAnimationFrame.current = null;
      setViewportRange(renderedViewportRangeRef.current);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      range: renderedViewportRangeRef.current,
      crossOffset,
    };
    setIsDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = rect.width / canvasW;
    const deltaSvg = (e.clientX - dragState.current.startX) / scale;
    const deltaTime =
      -(deltaSvg / axisLength) *
      (dragState.current.range.end - dragState.current.range.start);
    pendingDragRange.current = clampViewportRange(
      {
        start: dragState.current.range.start + deltaTime,
        end: dragState.current.range.end + deltaTime,
      },
      panBounds,
    );
    pendingCrossOffset.current = clampCanvasOffset(
      dragState.current.crossOffset + (e.clientY - dragState.current.startY),
      measuredHeight,
      canvasH,
      crossPanPadding,
    );
    if (dragFrame.current === null) {
      dragFrame.current = requestAnimationFrame(() => {
        if (pendingDragRange.current) {
          setViewportRange(pendingDragRange.current);
          pendingDragRange.current = null;
        }
        if (pendingCrossOffset.current !== null) {
          setCrossOffset(pendingCrossOffset.current);
          pendingCrossOffset.current = null;
        }
        dragFrame.current = null;
      });
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    const pointerStart = dragState.current;
    if (pointerStart) {
      const moved = Math.hypot(
        e.clientX - pointerStart.startX,
        e.clientY - pointerStart.startY,
      );
      if (moved <= 4) {
        setFocusedNodeId(null);
        setFocusedClusterNodeIds(null);
      }
    }
    dragState.current = null;
    setIsDragging(false);
  }

  function handlePointerCancel() {
    dragState.current = null;
    setIsDragging(false);
  }

  const focused = focusedNodeId ? findNodeAndStoryline(focusedNodeId) : null;

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <div className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-white/35 px-2 py-1 text-[10px] text-neutral-500/65 backdrop-blur-[2px]">
        拖曳／滾輪平移 · Ctrl/⌘＋滾輪縮放
      </div>

      <div
        ref={containerRef}
        className="timeline-canvas relative h-full w-full select-none overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{
          cursor: isDragging ? "grabbing" : "grab",
          touchAction: "none",
          backgroundPosition: `${((timeToPos(0) % 24) + 24) % 24}px ${((crossOffset % 24) + 24) % 24}px, 0 0, 0 0, center, center`,
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${canvasW} ${canvasH}`}
          width={canvasW}
          height={canvasH}
          className="absolute left-0 max-w-none"
          role="img"
          aria-label="歷史時間軸，顯示各故事線的節點分佈"
          style={{ top: crossOffset }}
        >
          <rect width={canvasW} height={canvasH} fill="transparent" />

          {/* main axis */}
          <line
            x1={marginStart}
            y1={aboveExtent + axisCrossMargin}
            x2={marginStart + axisLength}
            y2={aboveExtent + axisCrossMargin}
            stroke="var(--border-stronger, #999)"
            strokeWidth={1.5}
          />

          {/* ticks */}
          {ticks.map((t) => {
            const pos = timeToPos(t);
            const axisCenter = aboveExtent + axisCrossMargin;
            return (
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
                  fontSize={metrics.tickFontSize}
                  fill="#666"
                >
                  {formatTimelineTick(t, span)}
                </text>
              </g>
            );
          })}

          {/* storylines */}
          {[...above, ...below].map((layout) => {
            const isAbove = layout.storyline.position === "above";
            const laneSign = isAbove ? 1 : -1;
            const trackOffset = layout.baseOffset;
            const trackY = point(0, laneSign * trackOffset).y;
            const visibilityIconX = marginStart - 12;
            const visibilityIconY = trackY - 4;
            const displayName = truncateTextToWidth(
              layout.storyline.name,
              storylineLabelMaxWidth,
              metrics.storylineFontSize,
            );

            return (
              <g key={layout.storyline.id}>
                {/* track label and quick-hide control */}
                <g
                  data-timeline-action
                  role="button"
                  tabIndex={0}
                  aria-label={`隱藏故事線「${layout.storyline.name}」`}
                  style={{ cursor: "pointer" }}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleStorylineVisibility(layout.storyline.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleStorylineVisibility(layout.storyline.id);
                    }
                  }}
                >
                  <title>{layout.storyline.name}－點擊隱藏</title>
                  <text
                    x={marginStart - 26}
                    y={trackY}
                    textAnchor="end"
                    fontSize={metrics.storylineFontSize}
                    fontWeight={500}
                    fill={layout.storyline.color}
                  >
                    {displayName}
                  </text>
                  <path
                    d={`M ${visibilityIconX - 7} ${visibilityIconY} Q ${visibilityIconX} ${visibilityIconY - 6} ${visibilityIconX + 7} ${visibilityIconY} Q ${visibilityIconX} ${visibilityIconY + 6} ${visibilityIconX - 7} ${visibilityIconY} Z`}
                    fill="white"
                    stroke={layout.storyline.color}
                    strokeWidth={1.25}
                  />
                  <circle
                    cx={visibilityIconX}
                    cy={visibilityIconY}
                    r={2.25}
                    fill={layout.storyline.color}
                  />
                </g>

                {/* track base line — the innermost track sits right next to the main axis, so its own line would be redundant */}
                {!innermostStorylineIds.has(layout.storyline.id) && (
                  <line
                    x1={marginStart}
                    y1={trackY}
                    x2={marginStart + axisLength}
                    y2={trackY}
                    stroke={layout.storyline.color}
                    strokeWidth={1}
                    opacity={0.4}
                  />
                )}

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
                      const isSelected =
                        mode === "edit" && selectedNodeId === node.id;
                      const laneOffset = trackOffset + lane * metrics.laneHeight;
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
                        labelOffset > metrics.labelBaseOffset || labelShift !== 0;

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
                          data-timeline-action
                          role="button"
                          tabIndex={matches ? 0 : -1}
                          aria-label={`${mode === "edit" ? "編輯" : "查看"}${node.title}${mode === "edit" ? "" : "詳情"}`}
                          aria-current={isSelected ? "true" : undefined}
                          opacity={opacity}
                          style={{
                            cursor: matches ? "pointer" : "default",
                            pointerEvents: matches ? "auto" : "none",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            activateNode(layout.storyline.id, node.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              activateNode(layout.storyline.id, node.id);
                            }
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
                                stroke={
                                  isSelected
                                    ? "#2563eb"
                                    : isHovered
                                      ? "#000"
                                      : "#0006"
                                }
                                strokeWidth={isSelected ? 2.5 : isHovered ? 1.5 : 0.5}
                              />
                            </>
                          ) : (
                            <circle
                              cx={centerPoint.x}
                              cy={centerPoint.y}
                              r={isHovered ? 4.5 : 3.5}
                              fill={isSelected ? "#dbeafe" : "none"}
                              stroke={isSelected ? "#2563eb" : layout.storyline.color}
                              strokeWidth={isSelected ? 3 : isHovered ? 2.5 : 1.75}
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
                            fontSize={metrics.labelFontSize}
                            fontWeight={isSelected || isHovered ? 700 : 400}
                            fill={isSelected ? "#1d4ed8" : isHovered ? "#000" : "#333"}
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
                    Math.max(timeToPos(cluster.center), marginStart),
                    marginStart + axisLength,
                  );
                  const clusterLaneOffset =
                    trackOffset + cluster.lane * metrics.laneHeight;
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
                    const clusterHasSelection =
                      mode === "edit" && cluster.nodeIds.includes(selectedNodeId ?? "");
                    const axisPoint = point(axisPos, 0);
                    const labelPoint = point(
                      axisPos,
                      laneSign * (clusterLaneOffset + metrics.labelBaseOffset),
                    );
                    const titleWidth = measureTextWidth(
                      firstNode.node.title,
                      metrics.labelFontSize,
                    );
                    return (
                      <g
                        key={cluster.id}
                        data-timeline-action
                        role="button"
                        tabIndex={0}
                        aria-label={`${mode === "edit" ? "編輯" : "查看"}同一時間的 ${cluster.nodeIds.length} 個節點`}
                        aria-current={clusterHasSelection ? "true" : undefined}
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (mode === "edit") {
                            activateNode(layout.storyline.id, firstNode.node.id);
                          } else {
                            setFocusedNodeId(null);
                            setFocusedClusterNodeIds(cluster.nodeIds);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (mode === "edit") {
                              activateNode(layout.storyline.id, firstNode.node.id);
                            } else {
                              setFocusedNodeId(null);
                              setFocusedClusterNodeIds(cluster.nodeIds);
                            }
                          }
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
                          fill={clusterHasSelection ? "#dbeafe" : "none"}
                          stroke={clusterHasSelection ? "#2563eb" : layout.storyline.color}
                          strokeWidth={clusterHasSelection ? 3 : 1.75}
                        />
                        {/* first node's label */}
                        <text
                          x={labelPoint.x}
                          y={labelPoint.y}
                          textAnchor="middle"
                          fontSize={metrics.labelFontSize}
                          fill={clusterHasSelection ? "#1d4ed8" : "#333"}
                          fontWeight={clusterHasSelection ? 700 : 400}
                        >
                          {firstNode.node.title}
                        </text>
                        {/* superscript count at top-right of the label */}
                        <text
                          x={labelPoint.x + titleWidth / 2 + 2}
                          y={labelPoint.y - 5}
                          fontSize={metrics.superscriptFontSize}
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
                      data-timeline-action
                      role="button"
                      tabIndex={0}
                      aria-label={`放大查看 ${cluster.nodeIds.length} 個相近節點`}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        animateViewportRange({
                          start: cluster.start - pad,
                          end: cluster.end + pad,
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          animateViewportRange({
                            start: cluster.start - pad,
                            end: cluster.end + pad,
                          });
                        }
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
                        fontSize={metrics.clusterFontSize}
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
                const laneOffset = layout.baseOffset + found.lane * metrics.laneHeight;
                const axisPos = (found.renderStartPos + found.renderEndPos) / 2;
                const tooltipPoint = point(
                  axisPos + found.labelShift,
                  laneSign *
                    (laneOffset + found.labelOffset + metrics.hoverTooltipGap),
                );
                const tooltipText = found.node.timeRange
                  ? `${formatHistoricalDate(found.node.timeRange.start)} – ${formatHistoricalDate(found.node.timeRange.end)}`
                  : found.node.time
                    ? formatHistoricalDate(found.node.time)
                    : formatTimelineTick(found.start, span);
                const textWidth = measureTextWidth(tooltipText, metrics.tooltipFontSize);
                const tooltipHeight = metrics.tooltipFontSize + 7;
                return (
                  <g key="hover-tooltip" style={{ pointerEvents: "none" }}>
                    <rect
                      x={tooltipPoint.x - textWidth / 2 - 4}
                      y={tooltipPoint.y - metrics.tooltipFontSize}
                      width={textWidth + 8}
                      height={tooltipHeight}
                      rx={3}
                      fill="#fff"
                      stroke="#0002"
                      strokeWidth={1}
                    />
                    <text
                      x={tooltipPoint.x}
                      y={tooltipPoint.y}
                      textAnchor="middle"
                      fontSize={metrics.tooltipFontSize}
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

      {mode === "view" &&
        (focusedClusterNodeIds ? (
          <div className="fixed bottom-3 right-3 z-40 flex max-h-[calc(100vh-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col gap-2 overflow-y-auto overscroll-contain rounded-2xl border border-black/10 bg-white/95 p-2 shadow-2xl backdrop-blur-sm">
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
          <div className="fixed bottom-3 right-3 z-40 max-h-[calc(100vh-1.5rem)] max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-black/10 bg-white/95 p-2 shadow-2xl backdrop-blur-sm">
            <NodeDetailCard node={focused.node} storyline={focused.storyline} />
          </div>
        ) : null)}
    </div>
  );
}
