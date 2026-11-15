import { useEffect, useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import type { Storyline, StorylinePosition } from '../../types'

const PALETTE = ['#D85A30', '#378ADD', '#7F77DD', '#D4537E', '#1D9E75', '#BA7517']

export function StorylineEditor({
  storyline,
  onClose,
}: {
  /** When provided, the editor opens in edit mode for this storyline instead of create mode. */
  storyline?: Storyline
  onClose: () => void
}) {
  const addStoryline = useTimelineStore((s) => s.addStoryline)
  const updateStoryline = useTimelineStore((s) => s.updateStoryline)
  const storylines = useTimelineStore((s) => s.storylines)
  const isEditing = Boolean(storyline)
  const defaultPosition = storyline?.position ?? 'above'
  const defaultOrder = Math.max(
    0,
    ...storylines.filter((item) => item.position === defaultPosition).map((item) => item.order)
  ) + 1

  const [name, setName] = useState(storyline?.name ?? '')
  const [position, setPosition] = useState<StorylinePosition>(defaultPosition)
  const [order, setOrder] = useState(storyline?.order ?? defaultOrder)
  const [color, setColor] = useState(storyline?.color ?? PALETTE[storylines.length % PALETTE.length])
  const [description, setDescription] = useState(storyline?.description ?? '')

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [onClose])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    if (isEditing && storyline) {
      updateStoryline(storyline.id, {
        name: name.trim(),
        color,
        position,
        order,
        description: description.trim() || undefined,
      })
    } else {
      addStoryline({
        id: `storyline-${crypto.randomUUID()}`,
        name: name.trim(),
        color,
        position,
        order,
        description: description.trim() || undefined,
        nodes: [],
      })
    }
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
        className="mx-4 w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="storyline-editor-title"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 id="storyline-editor-title" className="text-base font-semibold">{isEditing ? '編輯故事線' : '新增故事線'}</h3>
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
            className="form-control mt-1"
            autoFocus
            required
          />
        </label>

        <label className="mb-2.5 block text-xs text-neutral-600">
          位置
          <select
            value={position}
            onChange={(e) => {
              const nextPosition = e.target.value as StorylinePosition
              setPosition(nextPosition)
              if (!isEditing) {
                setOrder(Math.max(0, ...storylines.filter((item) => item.position === nextPosition).map((item) => item.order)) + 1)
              }
            }}
            className="form-control mt-1"
          >
            <option value="above">上方（水平模式）/ 左側（垂直模式）</option>
            <option value="below">下方（水平模式）/ 右側（垂直模式）</option>
          </select>
        </label>

        <label className="mb-2.5 block text-xs text-neutral-600">
          排列順序（數字越小越靠近主軸）
          <input
            type="number"
            min={1}
            value={order}
            onChange={(e) => setOrder(Number(e.target.value) || 1)}
            className="form-control mt-1"
          />
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
            className="form-control mt-1"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            取消
          </button>
          <button type="submit" className="btn-primary">
            {isEditing ? '儲存變更' : '建立故事線'}
          </button>
        </div>
      </form>
    </div>
  )
}
