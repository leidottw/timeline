import { useMemo, useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import { NodeEditor } from './NodeEditor'
import { StorylineEditor } from './StorylineEditor'
import type { Storyline, TimelineNode } from '../../types'
import { formatHistoricalDate, getNodeSpan } from '../../lib/date/historicalDate'

function sortedNodes(nodes: TimelineNode[]): TimelineNode[] {
  return [...nodes]
    .map((node) => {
      try {
        const [start] = getNodeSpan(node)
        return { node, start }
      } catch {
        return null
      }
    })
    .filter((v): v is { node: TimelineNode; start: number } => v !== null)
    .sort((a, b) => a.start - b.start)
    .map((v) => v.node)
}

function formatNodeTime(node: TimelineNode): string {
  if (node.timeRange) {
    return `${formatHistoricalDate(node.timeRange.start)} — ${formatHistoricalDate(node.timeRange.end)}`
  }
  if (node.time) {
    return formatHistoricalDate(node.time)
  }
  return ''
}

function StorylineRow({
  storyline,
  expanded,
  onToggleExpand,
  onEdit,
  onAddNode,
  onRemove,
}: {
  storyline: Storyline
  expanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onAddNode: () => void
  onRemove: () => void
}) {
  const setFocusedNodeId = useTimelineStore((s) => s.setFocusedNodeId)
  const nodes = useMemo(() => sortedNodes(storyline.nodes), [storyline.nodes])

  return (
    <div className="rounded-md border border-black/10">
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
        <button
          onClick={onToggleExpand}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-800"
          title={expanded ? '收合節點清單' : '展開節點清單'}
          aria-label={expanded ? '收合節點清單' : '展開節點清單'}
          aria-expanded={expanded}
        >
          <i className={`ti ${expanded ? 'ti-chevron-down' : 'ti-chevron-right'} text-sm`} aria-hidden="true" />
        </button>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: storyline.color }} />
        <span className="font-medium">{storyline.name}</span>
        <span className="text-neutral-400">
          {storyline.position === 'above' ? '上/左' : '下/右'} · {storyline.nodes.length} 節點
        </span>

        <div className="flex-1" />

        <button
          onClick={onEdit}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-800"
          title="編輯故事線"
          aria-label="編輯故事線"
        >
          <i className="ti ti-edit text-sm" aria-hidden="true" />
        </button>
        <button
          onClick={onAddNode}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-800"
          title="新增節點"
          aria-label="新增節點"
        >
          <i className="ti ti-plus text-sm" aria-hidden="true" />
        </button>
        <button
          onClick={onRemove}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-400 hover:text-red-600"
          title="刪除故事線"
          aria-label="刪除故事線"
        >
          <i className="ti ti-trash text-sm" aria-hidden="true" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-black/10">
          {nodes.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-neutral-400">尚無節點</p>
          ) : (
            <ul>
              {nodes.map((node) => (
                <li key={node.id}>
                  <button
                    onClick={() => setFocusedNodeId(node.id)}
                    className="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-neutral-50"
                  >
                    <span className="shrink-0 text-neutral-400" style={{ minWidth: 120 }}>
                      {formatNodeTime(node)}
                    </span>
                    <span className="truncate text-neutral-800">{node.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function StorylineLegend() {
  const storylines = useTimelineStore((s) => s.storylines)
  const removeStoryline = useTimelineStore((s) => s.removeStoryline)
  const [addNodeFor, setAddNodeFor] = useState<Storyline | null>(null)
  const [editStoryline, setEditStoryline] = useState<Storyline | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-2.5">
      {storylines.map((s) => (
        <StorylineRow
          key={s.id}
          storyline={s}
          expanded={expandedIds.has(s.id)}
          onToggleExpand={() => toggleExpand(s.id)}
          onEdit={() => setEditStoryline(s)}
          onAddNode={() => setAddNodeFor(s)}
          onRemove={() => removeStoryline(s.id)}
        />
      ))}

      {addNodeFor && <NodeEditor storyline={addNodeFor} onClose={() => setAddNodeFor(null)} />}
      {editStoryline && (
        <StorylineEditor storyline={editStoryline} onClose={() => setEditStoryline(null)} />
      )}
    </div>
  )
}
