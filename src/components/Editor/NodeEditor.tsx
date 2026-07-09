import { useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import type { LinkType, Storyline, TimelineNode } from '../../types'

export function NodeEditor({
  storyline,
  node,
  onClose,
}: {
  storyline: Storyline
  /** When provided, the editor opens in edit mode for this node instead of create mode. */
  node?: TimelineNode
  onClose: () => void
}) {
  const addNode = useTimelineStore((s) => s.addNode)
  const updateNode = useTimelineStore((s) => s.updateNode)
  const isEditing = Boolean(node)

  const [title, setTitle] = useState(node?.title ?? '')
  const [isRange, setIsRange] = useState(Boolean(node?.timeRange))
  const [time, setTime] = useState(node?.time ?? '')
  const [rangeStart, setRangeStart] = useState(node?.timeRange?.start ?? '')
  const [rangeEnd, setRangeEnd] = useState(node?.timeRange?.end ?? '')
  const [description, setDescription] = useState(node?.description ?? '')
  const [tagsInput, setTagsInput] = useState((node?.tags ?? []).join(', '))
  const [linkUrl, setLinkUrl] = useState(node?.links?.[0]?.url ?? '')
  const [linkType, setLinkType] = useState<LinkType>(node?.links?.[0]?.type ?? 'generic')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError('請輸入標題')
      return
    }
    if (isRange) {
      if (!rangeStart.trim() || !rangeEnd.trim()) {
        setError('請輸入起訖時間')
        return
      }
    } else if (!time.trim()) {
      setError('請輸入時間')
      return
    }

    const tags = tagsInput
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)

    const payload = {
      title: title.trim(),
      ...(isRange
        ? { timeRange: { start: rangeStart.trim(), end: rangeEnd.trim() }, time: undefined }
        : { time: time.trim(), timeRange: undefined }),
      description: description.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      links: linkUrl.trim() ? [{ url: linkUrl.trim(), type: linkType }] : undefined,
    }

    if (isEditing && node) {
      updateNode(storyline.id, node.id, payload)
    } else {
      addNode(storyline.id, { id: `node-${Date.now()}`, ...payload })
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
        className="max-h-[85vh] w-96 overflow-y-auto rounded-xl bg-white p-5 shadow-lg"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-medium">
            {isEditing ? '編輯節點' : '新增節點'}{' '}
            <span style={{ color: storyline.color }}>· {storyline.name}</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="關閉">
            <i className="ti ti-x text-neutral-400" aria-hidden="true" />
          </button>
        </div>

        <label className="mb-2.5 block text-xs text-neutral-600">
          標題
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full" autoFocus />
        </label>

        <div className="mb-2.5 flex items-center gap-2 text-xs text-neutral-600">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={!isRange} onChange={() => setIsRange(false)} />
            單一時間點
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={isRange} onChange={() => setIsRange(true)} />
            時間範圍
          </label>
        </div>

        {isRange ? (
          <div className="mb-2.5 flex gap-2">
            <label className="flex-1 text-xs text-neutral-600">
              起始
              <input
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                placeholder="例如 0208-07 或 -0305"
                className="mt-1 w-full"
              />
            </label>
            <label className="flex-1 text-xs text-neutral-600">
              結束
              <input
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                placeholder="例如 0208-11"
                className="mt-1 w-full"
              />
            </label>
          </div>
        ) : (
          <label className="mb-2.5 block text-xs text-neutral-600">
            時間
            <input
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="例如 0220-12 或 -0030"
              className="mt-1 w-full"
            />
          </label>
        )}

        <label className="mb-2.5 block text-xs text-neutral-600">
          說明（選填）
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full" />
        </label>

        <label className="mb-2.5 block text-xs text-neutral-600">
          標籤（以逗號分隔，選填）
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="戰爭, 條約"
            className="mt-1 w-full"
          />
        </label>

        <div className="mb-4 flex gap-2">
          <label className="flex-1 text-xs text-neutral-600">
            連結（選填）
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://" className="mt-1 w-full" />
          </label>
          <label className="text-xs text-neutral-600">
            類型
            <select value={linkType} onChange={(e) => setLinkType(e.target.value as LinkType)} className="mt-1">
              <option value="generic">一般</option>
              <option value="youtube">YouTube</option>
              <option value="wiki">Wiki</option>
            </select>
          </label>
        </div>

        {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-xs">
            取消
          </button>
          <button type="submit" className="text-xs font-medium">
            {isEditing ? '儲存變更' : '新增節點'}
          </button>
        </div>
      </form>
    </div>
  )
}
