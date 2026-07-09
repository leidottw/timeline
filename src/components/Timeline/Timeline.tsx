import { useMemo, useRef, useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import { computeStorylineLayouts, totalExtent } from '../../lib/layout/timelineLayout'
import { generateTicks } from '../../lib/layout/ticks'
import { formatYearLabel } from '../../lib/date/historicalDate'
import { nodeMatchesTags } from '../../lib/filter/tagFilter'
import { NodeDetailCard } from '../Node/NodeDetailCard'
import type { Storyline, TimelineNode } from '../../types'

const AXIS_LENGTH = 900
const MARGIN_START = 90
const MARGIN_END = 30
const AXIS_CROSS_MARGIN = 40

export function Timeline() {
  const storylines = useTimelineStore((s) => s.storylines)
  const viewportRange = useTimelineStore((s) => s.viewportRange)
  const setViewportRange = useTimelineStore((s) => s.setViewportRange)
  const orientation = useTimelineStore((s) => s.orientation)
  const activeTags = useTimelineStore((s) => s.activeTags)
  const tagMode = useTimelineStore((s) => s.tagMode)
  const focusedNodeId = useTimelineStore((s) => s.focusedNodeId)
  const setFocusedNodeId = useTimelineStore((s) => s.setFocusedNodeId)

  const containerRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; range: typeof viewportRange } | null>(
    null
  )
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const { above, below } = useMemo(() => computeStorylineLayouts(storylines), [storylines])
  const aboveExtent = totalExtent(above)
  const belowExtent = totalExtent(below)

  const crossLength = aboveExtent + belowExtent + AXIS_CROSS_MARGIN * 2
  const isHorizontal = orientation === 'horizontal'
  const canvasW = isHorizontal ? MARGIN_START + AXIS_LENGTH + MARGIN_END : crossLength
  const canvasH = isHorizontal ? crossLength : MARGIN_START + AXIS_LENGTH + MARGIN_END

  const span = viewportRange.end - viewportRange.start || 1

  function timeToPos(t: number): number {
    const fraction = (t - viewportRange.start) / span
    return MARGIN_START + fraction * AXIS_LENGTH
  }

  function point(pos: number, offset: number): { x: number; y: number } {
    const axisCenter = aboveExtent + AXIS_CROSS_MARGIN
    return isHorizontal ? { x: pos, y: axisCenter - offset } : { x: axisCenter - offset, y: pos }
  }

  const ticks = generateTicks(viewportRange.start, viewportRange.end)

  function findNodeAndStoryline(id: string): { node: TimelineNode; storyline: Storyline } | null {
    for (const s of storylines) {
      const n = s.nodes.find((n) => n.id === id)
      if (n) return { node: n, storyline: s }
    }
    return null
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12
    const rect = containerRef.current?.getBoundingClientRect()
    let centerFraction = 0.5
    if (rect) {
      const localPos = isHorizontal ? e.clientX - rect.left : e.clientY - rect.top
      const scale = isHorizontal ? rect.width / canvasW : rect.height / canvasH
      const svgPos = localPos / scale
      centerFraction = Math.min(1, Math.max(0, (svgPos - MARGIN_START) / AXIS_LENGTH))
    }
    const newSpanRaw = span * factor
    const newSpan = Math.max(newSpanRaw, 0.5)
    const center = viewportRange.start + span * centerFraction
    setViewportRange({
      start: center - newSpan * centerFraction,
      end: center + newSpan * (1 - centerFraction),
    })
  }

  function handlePointerDown(e: React.PointerEvent) {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragState.current = { startX: e.clientX, startY: e.clientY, range: viewportRange }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const scale = isHorizontal ? rect.width / canvasW : rect.height / canvasH
    const deltaScreen = isHorizontal
      ? e.clientX - dragState.current.startX
      : e.clientY - dragState.current.startY
    const deltaSvg = deltaScreen / scale
    const deltaTime = -(deltaSvg / AXIS_LENGTH) * (dragState.current.range.end - dragState.current.range.start)
    setViewportRange({
      start: dragState.current.range.start + deltaTime,
      end: dragState.current.range.end + deltaTime,
    })
  }

  function handlePointerUp() {
    dragState.current = null
  }

  const focused = focusedNodeId ? findNodeAndStoryline(focusedNodeId) : null

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
        style={{ cursor: 'grab' }}
      >
        <svg
          viewBox={`0 0 ${canvasW} ${canvasH}`}
          width="100%"
          height={isHorizontal ? Math.min(canvasH, 560) : Math.min(canvasH, 720)}
          role="img"
          aria-label="歷史時間軸，顯示各故事線的節點分佈"
        >
          {/* main axis */}
          {isHorizontal ? (
            <line
              x1={MARGIN_START}
              y1={aboveExtent + AXIS_CROSS_MARGIN}
              x2={MARGIN_START + AXIS_LENGTH}
              y2={aboveExtent + AXIS_CROSS_MARGIN}
              stroke="var(--border-stronger, #999)"
              strokeWidth={1.5}
            />
          ) : (
            <line
              x1={aboveExtent + AXIS_CROSS_MARGIN}
              y1={MARGIN_START}
              x2={aboveExtent + AXIS_CROSS_MARGIN}
              y2={MARGIN_START + AXIS_LENGTH}
              stroke="var(--border-stronger, #999)"
              strokeWidth={1.5}
            />
          )}

          {/* ticks */}
          {ticks.map((t) => {
            const pos = timeToPos(t)
            const axisCenter = aboveExtent + AXIS_CROSS_MARGIN
            return isHorizontal ? (
              <g key={t}>
                <line x1={pos} y1={axisCenter - 4} x2={pos} y2={axisCenter + 4} stroke="#999" strokeWidth={1} />
                <text x={pos} y={axisCenter + 18} textAnchor="middle" fontSize={11} fill="#888">
                  {formatYearLabel(t)}
                </text>
              </g>
            ) : (
              <g key={t}>
                <line x1={axisCenter - 4} y1={pos} x2={axisCenter + 4} y2={pos} stroke="#999" strokeWidth={1} />
                <text x={axisCenter - 10} y={pos + 4} textAnchor="end" fontSize={11} fill="#888">
                  {formatYearLabel(t)}
                </text>
              </g>
            )
          })}

          {/* storylines */}
          {[...above, ...below].map((layout) => {
            const isAbove = layout.storyline.position === 'above'
            const laneSign = isAbove ? 1 : -1
            const trackOffset = layout.baseOffset

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

                {/* track base line */}
                {isHorizontal ? (
                  <line
                    x1={MARGIN_START}
                    y1={point(0, laneSign * trackOffset).y}
                    x2={MARGIN_START + AXIS_LENGTH}
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
                    y2={MARGIN_START + AXIS_LENGTH}
                    stroke={layout.storyline.color}
                    strokeWidth={1}
                    opacity={0.4}
                  />
                )}

                {/* nodes */}
                {layout.lanedNodes.map(({ node, lane, start, end }) => {
                  const matches = nodeMatchesTags(node, activeTags, tagMode)
                  const opacity = matches ? 1 : 0.15
                  const laneOffset = trackOffset + lane * 26
                  const startPos = timeToPos(start)
                  const endPos = timeToPos(end)
                  const isRange = node.timeRange !== undefined
                  const centerPoint = point((startPos + endPos) / 2, laneSign * laneOffset)
                  const p1 = point(startPos, laneSign * laneOffset)
                  const p2 = point(endPos, laneSign * laneOffset)
                  const connectorEnd = point(isRange ? (startPos + endPos) / 2 : startPos, 0)

                  return (
                    <g
                      key={node.id}
                      opacity={opacity}
                      style={{ cursor: matches ? 'pointer' : 'default', pointerEvents: matches ? 'auto' : 'none' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setFocusedNodeId(node.id)
                      }}
                      onMouseEnter={() => setHoveredNode(node.id)}
                      onMouseLeave={() => setHoveredNode((h) => (h === node.id ? null : h))}
                    >
                      <line
                        x1={connectorEnd.x}
                        y1={connectorEnd.y}
                        x2={centerPoint.x}
                        y2={centerPoint.y}
                        stroke={layout.storyline.color}
                        strokeWidth={1}
                        strokeDasharray="2,2"
                        opacity={0.6}
                      />

                      {isRange ? (
                        isHorizontal ? (
                          <rect
                            x={Math.min(p1.x, p2.x)}
                            y={p1.y - 4}
                            width={Math.max(Math.abs(p2.x - p1.x), 8)}
                            height={8}
                            rx={4}
                            fill={layout.storyline.color}
                            stroke="#0006"
                            strokeWidth={0.5}
                          />
                        ) : (
                          <rect
                            x={p1.x - 4}
                            y={Math.min(p1.y, p2.y)}
                            width={8}
                            height={Math.max(Math.abs(p2.y - p1.y), 8)}
                            rx={4}
                            fill={layout.storyline.color}
                            stroke="#0006"
                            strokeWidth={0.5}
                          />
                        )
                      ) : (
                        <circle cx={centerPoint.x} cy={centerPoint.y} r={6} fill={layout.storyline.color} stroke="#0006" strokeWidth={0.5} />
                      )}

                      <text
                        x={centerPoint.x}
                        y={centerPoint.y + laneSign * -14}
                        textAnchor="middle"
                        fontSize={10}
                        fill="#333"
                      >
                        {node.title}
                      </text>

                      {hoveredNode === node.id && (
                        <text
                          x={centerPoint.x}
                          y={centerPoint.y + laneSign * -26}
                          textAnchor="middle"
                          fontSize={9}
                          fill="#666"
                        >
                          {node.timeRange
                            ? `${formatYearLabel(start)} – ${formatYearLabel(end)}`
                            : formatYearLabel(start)}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>

      {focused && (
        <div className="mt-3 flex justify-end">
          <NodeDetailCard node={focused.node} storyline={focused.storyline} />
        </div>
      )}
    </div>
  )
}
