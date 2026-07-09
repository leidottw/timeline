import { useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import type { StorylinePosition } from '../../types'

const PALETTE = ['#D85A30', '#378ADD', '#7F77DD', '#D4537E', '#1D9E75', '#BA7517']

export function StorylineEditor({ onClose }: { onClose: () => void }) {
  const addStoryline = useTimelineStore((s) => s.addStoryline)
  const storylines = useTimelineStore((s) => s.storylines)

  const [name, setName] = useState('')
  const [position, setPosition] = useState<StorylinePosition>('above')
  const [color, setColor] = useState(PALETTE[storylines.length % PALETTE.length])
  const [description, setDescription] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const sameSide = storylines.filter((s) => s.position === position)
    const order = sameSide.length > 0 ? Math.max(...sameSide.map((s) => s.order)) + 1 : 1
    addStoryline({
      id: `storyline-${Date.now()}`,
      name: name.trim(),
      color,
      position,
      order,
      description: description.trim() || undefined,
      nodes: [],
    })
    onClose()
  }

  return (
    <div
      style={{ minHeight: 400 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-80 rounded-xl bg-white p-5 shadow-lg"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-medium">新增故事線</h3>
          <button type="button" onClick={onClose} aria-label="關閉">
            <i className="ti ti-x text-neutral-400" aria-hidden="true" />
          </button>
        </div>

        <label className="mb-2.5 block text-xs text-neutral-600">
          名稱
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：三國"
            className="mt-1 w-full"
            autoFocus
          />
        </label>

        <label className="mb-2.5 block text-xs text-neutral-600">
          位置
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value as StorylinePosition)}
            className="mt-1 w-full"
          >
            <option value="above">上方（水平模式）/ 左側（垂直模式）</option>
            <option value="below">下方（水平模式）/ 右側（垂直模式）</option>
          </select>
        </label>

        <label className="mb-2.5 block text-xs text-neutral-600">
          代表色
          <div className="mt-1 flex gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{ background: c }}
                className={`h-6 w-6 rounded-full ${color === c ? 'ring-2 ring-offset-1 ring-black/40' : ''}`}
                aria-label={c}
              />
            ))}
          </div>
        </label>

        <label className="mb-4 block text-xs text-neutral-600">
          簡介（選填）
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-xs">
            取消
          </button>
          <button type="submit" className="text-xs font-medium">
            建立故事線
          </button>
        </div>
      </form>
    </div>
  )
}
