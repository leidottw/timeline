import { useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import { NodeEditor } from './NodeEditor'
import { StorylineEditor } from './StorylineEditor'
import type { Storyline } from '../../types'

export function StorylineLegend() {
  const storylines = useTimelineStore((s) => s.storylines)
  const removeStoryline = useTimelineStore((s) => s.removeStoryline)
  const [addNodeFor, setAddNodeFor] = useState<Storyline | null>(null)
  const [editStoryline, setEditStoryline] = useState<Storyline | null>(null)

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2.5">
      {storylines.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-2 rounded-md border border-black/10 px-2.5 py-1.5 text-xs"
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
          <span className="font-medium">{s.name}</span>
          <span className="text-neutral-400">
            {s.position === 'above' ? '上/左' : '下/右'} · {s.nodes.length} 節點
          </span>
          <button
            onClick={() => setEditStoryline(s)}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-800"
            title="編輯故事線"
            aria-label="編輯故事線"
          >
            <i className="ti ti-edit text-sm" aria-hidden="true" />
          </button>
          <button
            onClick={() => setAddNodeFor(s)}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-800"
            title="新增節點"
            aria-label="新增節點"
          >
            <i className="ti ti-plus text-sm" aria-hidden="true" />
          </button>
          <button
            onClick={() => removeStoryline(s.id)}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-400 hover:text-red-600"
            title="刪除故事線"
            aria-label="刪除故事線"
          >
            <i className="ti ti-trash text-sm" aria-hidden="true" />
          </button>
        </div>
      ))}

      {addNodeFor && <NodeEditor storyline={addNodeFor} onClose={() => setAddNodeFor(null)} />}
      {editStoryline && (
        <StorylineEditor storyline={editStoryline} onClose={() => setEditStoryline(null)} />
      )}
    </div>
  )
}
