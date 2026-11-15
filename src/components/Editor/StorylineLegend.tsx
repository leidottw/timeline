import { useEffect, useMemo, useRef, useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import type { Storyline, TimelineNode } from '../../types'
import { formatHistoricalDate, getNodeSpan } from '../../lib/date/historicalDate'
import type { EditorSelection } from './editorSelection'

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
    .filter((value): value is { node: TimelineNode; start: number } => value !== null)
    .sort((a, b) => a.start - b.start)
    .map((value) => value.node)
}

function formatNodeTime(node: TimelineNode): string {
  if (node.timeRange) return `${formatHistoricalDate(node.timeRange.start)} — ${formatHistoricalDate(node.timeRange.end)}`
  return node.time ? formatHistoricalDate(node.time) : ''
}

function isStorylineSelected(selection: EditorSelection | null, storyline: Storyline): boolean {
  return selection?.type === 'storyline' && selection.storylineId === storyline.id
}

export function StorylineSidebar({
  selection,
  onSelect,
  onNodeSelect,
  onCollapse,
}: {
  selection: EditorSelection | null
  onSelect: (selection: EditorSelection) => void
  onNodeSelect: (storylineId: string, nodeId: string) => void
  onCollapse: () => void
}) {
  const storylines = useTimelineStore((state) => state.storylines)
  const hiddenStorylineIds = useTimelineStore((state) => state.hiddenStorylineIds)
  const toggleStorylineVisibility = useTimelineStore((state) => state.toggleStorylineVisibility)
  const nodeRowRefs = useRef(new Map<string, HTMLButtonElement>())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(storylines.slice(0, 1).map((storyline) => storyline.id))
  )

  const orderedStorylines = useMemo(
    () =>
      [...storylines].sort(
        (a, b) =>
          (a.position === b.position ? 0 : a.position === 'above' ? -1 : 1) || a.order - b.order
      ),
    [storylines]
  )

  const nodesByStoryline = useMemo(
    () => new Map(storylines.map((storyline) => [storyline.id, sortedNodes(storyline.nodes)])),
    [storylines]
  )

  useEffect(() => {
    if (selection?.type !== 'node' && selection?.type !== 'new-node') return
    setExpandedIds((current) => {
      if (current.has(selection.storylineId)) return current
      return new Set([...current, selection.storylineId])
    })
  }, [selection])

  useEffect(() => {
    if (selection?.type !== 'node' || !expandedIds.has(selection.storylineId)) return
    const frame = requestAnimationFrame(() => {
      const row = nodeRowRefs.current.get(selection.nodeId)
      row?.focus({ preventScroll: true })
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [expandedIds, selection])

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <aside className="workspace-sidebar workspace-sidebar-left" aria-label="故事線管理">
      <div className="workspace-pane-header">
        <div>
          <p className="workspace-pane-eyebrow">內容管理</p>
          <h2>故事線</h2>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onSelect({ type: 'new-storyline' })} className="workspace-icon-button" aria-label="新增故事線" title="新增故事線">
            <i className="ti ti-plus" aria-hidden="true" />
          </button>
          <button type="button" onClick={onCollapse} className="workspace-icon-button" aria-label="收合故事線側欄" title="收合側欄">
            <i className="ti ti-layout-sidebar-left-collapse" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="workspace-tree" role="tree" aria-label="故事線與節點">
        {storylines.length === 0 ? (
          <div className="workspace-empty-state">
            <p>尚無故事線</p>
            <button type="button" className="btn-primary" onClick={() => onSelect({ type: 'new-storyline' })}>建立第一條故事線</button>
          </div>
        ) : (
          orderedStorylines.map((storyline) => {
            const expanded = expandedIds.has(storyline.id)
            const visible = !hiddenStorylineIds.includes(storyline.id)
            const nodes = nodesByStoryline.get(storyline.id) ?? []
            return (
              <section key={storyline.id} className={`workspace-storyline ${visible ? '' : 'is-hidden'}`}>
                <div className={`workspace-storyline-row ${isStorylineSelected(selection, storyline) ? 'is-selected' : ''}`} role="treeitem" aria-expanded={expanded}>
                  <button type="button" className="workspace-tree-toggle" onClick={() => toggleExpanded(storyline.id)} aria-label={`${expanded ? '收合' : '展開'}「${storyline.name}」`}>
                    <i className={`ti ti-chevron-${expanded ? 'down' : 'right'}`} aria-hidden="true" />
                  </button>
                  <button type="button" className="workspace-storyline-main" onClick={() => onSelect({ type: 'storyline', storylineId: storyline.id })} title={storyline.name}>
                    <span className="workspace-color-dot" style={{ background: storyline.color }} />
                    <span className="truncate">{storyline.name}</span>
                    <span className="workspace-count">{storyline.nodes.length}</span>
                  </button>
                  <button type="button" className="workspace-tree-action" onClick={() => toggleStorylineVisibility(storyline.id)} aria-label={`${visible ? '隱藏' : '顯示'}故事線「${storyline.name}」`} title={visible ? '隱藏故事線' : '顯示故事線'} aria-pressed={visible}>
                    <i className={`ti ${visible ? 'ti-eye' : 'ti-eye-off'}`} aria-hidden="true" />
                  </button>
                  <button type="button" className="workspace-tree-action" onClick={() => onSelect({ type: 'new-node', storylineId: storyline.id })} aria-label={`在「${storyline.name}」新增節點`} title="新增節點">
                    <i className="ti ti-plus" aria-hidden="true" />
                  </button>
                </div>

                {expanded && (
                  <div className="workspace-node-list" role="group">
                    {nodes.length === 0 ? (
                      <button type="button" className="workspace-add-node-empty" onClick={() => onSelect({ type: 'new-node', storylineId: storyline.id })}>＋ 新增第一個節點</button>
                    ) : (
                      nodes.map((node) => {
                        const selected = selection?.type === 'node' && selection.storylineId === storyline.id && selection.nodeId === node.id
                        return (
                          <button
                            type="button"
                            key={node.id}
                            ref={(element) => {
                              if (element) nodeRowRefs.current.set(node.id, element)
                              else nodeRowRefs.current.delete(node.id)
                            }}
                            className={`workspace-node-row ${selected ? 'is-selected' : ''}`}
                            onClick={() => onNodeSelect(storyline.id, node.id)}
                            role="treeitem"
                            aria-current={selected ? 'true' : undefined}
                            title={`${formatNodeTime(node)} · ${node.title}`}
                          >
                            <span className="workspace-node-time">{formatNodeTime(node)}</span>
                            <span className="truncate">{node.title}</span>
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </section>
            )
          })
        )}
      </div>
    </aside>
  )
}
