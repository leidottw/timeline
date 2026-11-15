import { useEffect, useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import type { LinkType, NodeLink, Storyline, TimelineNode } from '../../types'
import { getNodeSpan } from '../../lib/date/historicalDate'

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
  const removeNode = useTimelineStore((s) => s.removeNode)
  const isEditing = Boolean(node)

  const [title, setTitle] = useState(node?.title ?? '')
  const [isRange, setIsRange] = useState(Boolean(node?.timeRange))
  const [time, setTime] = useState(node?.time ?? '')
  const [rangeStart, setRangeStart] = useState(node?.timeRange?.start ?? '')
  const [rangeEnd, setRangeEnd] = useState(node?.timeRange?.end ?? '')
  const [description, setDescription] = useState(node?.description ?? '')
  const [tagsInput, setTagsInput] = useState((node?.tags ?? []).join(', '))
  const [nodeType, setNodeType] = useState(node?.nodeType ?? '')
  const [imagesInput, setImagesInput] = useState((node?.images ?? []).join('\n'))
  const [links, setLinks] = useState<NodeLink[]>(node?.links ?? [])
  const [error, setError] = useState<string | null>(null)

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

    const tags = Array.from(new Set(tagsInput
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)))

    const images = imagesInput
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean)

    const normalizedLinks = links
      .map((link) => ({ ...link, url: link.url.trim() }))
      .filter((link) => link.url)

    const payload: Omit<TimelineNode, 'id'> = {
      title: title.trim(),
      ...(isRange
        ? { timeRange: { start: rangeStart.trim(), end: rangeEnd.trim() }, time: undefined }
        : { time: time.trim(), timeRange: undefined }),
      description: description.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      nodeType: nodeType.trim() || undefined,
      images: images.length > 0 ? images : undefined,
      links: normalizedLinks.length > 0 ? normalizedLinks : undefined,
    }

    try {
      getNodeSpan(payload)
      for (const link of normalizedLinks) {
        const url = new URL(link.url)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('連結僅支援 HTTP(S)')
      }
      for (const image of images) {
        const url = new URL(image)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('圖片僅支援 HTTP(S)')
      }
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : '日期或網址格式錯誤')
      return
    }

    if (isEditing && node) {
      updateNode(storyline.id, node.id, payload)
    } else {
      addNode(storyline.id, { id: `node-${crypto.randomUUID()}`, ...payload })
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
        className="mx-4 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="node-editor-title"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 id="node-editor-title" className="text-base font-semibold">
            {isEditing ? '編輯節點' : '新增節點'}{' '}
            <span style={{ color: storyline.color }}>· {storyline.name}</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="關閉">
            <i className="ti ti-x text-neutral-400" aria-hidden="true" />
          </button>
        </div>

        <label className="mb-2.5 block text-xs text-neutral-600">
          標題
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="form-control mt-1" autoFocus required />
        </label>

        <div className="mb-2.5 flex items-center gap-2 text-xs text-neutral-600">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="node-time-kind" checked={!isRange} onChange={() => setIsRange(false)} />
            單一時間點
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="node-time-kind" checked={isRange} onChange={() => setIsRange(true)} />
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
                className="form-control mt-1"
                required
              />
            </label>
            <label className="flex-1 text-xs text-neutral-600">
              結束
              <input
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                placeholder="例如 0208-11"
                className="form-control mt-1"
                required
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
              className="form-control mt-1"
              required
            />
          </label>
        )}

        <label className="mb-2.5 block text-xs text-neutral-600">
          說明（選填）
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="form-control mt-1" />
        </label>

        <label className="mb-2.5 block text-xs text-neutral-600">
          標籤（以逗號分隔，選填）
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="戰爭, 條約"
            className="form-control mt-1"
          />
        </label>

        <div className="mb-2.5 grid grid-cols-2 gap-2">
          <label className="text-xs text-neutral-600">
            節點類型（選填）
            <input value={nodeType} onChange={(e) => setNodeType(e.target.value)} className="form-control mt-1" placeholder="人物、戰役…" />
          </label>
          <label className="text-xs text-neutral-600">
            圖片網址（每行一個）
            <textarea value={imagesInput} onChange={(e) => setImagesInput(e.target.value)} rows={2} className="form-control mt-1" placeholder="https://" />
          </label>
        </div>

        <fieldset className="mb-4 rounded-lg border border-neutral-200 p-3">
          <legend className="sr-only">外部連結（選填）</legend>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-700">外部連結（選填）</span>
            <button
              type="button"
              className="text-xs font-medium text-blue-700 hover:text-blue-900"
              onClick={() => setLinks((current) => [...current, { url: '', type: 'generic' }])}
            >
              ＋新增連結
            </button>
          </div>
          {links.length === 0 ? (
            <p className="text-xs text-neutral-400">尚未加入連結</p>
          ) : (
            <div className="space-y-2">
              {links.map((link, index) => (
                <div key={index} className="flex items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs text-neutral-600">
                    網址
                    <input
                      value={link.url}
                      onChange={(e) => setLinks((current) => current.map((item, i) => i === index ? { ...item, url: e.target.value } : item))}
                      className="form-control mt-1"
                      placeholder="https://"
                    />
                  </label>
                  <label className="text-xs text-neutral-600">
                    類型
                    <select
                      value={link.type}
                      onChange={(e) => setLinks((current) => current.map((item, i) => i === index ? { ...item, type: e.target.value as LinkType } : item))}
                      className="form-control mt-1"
                    >
                      <option value="generic">一般</option>
                      <option value="youtube">YouTube</option>
                      <option value="wiki">Wiki</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setLinks((current) => current.filter((_, i) => i !== index))}
                    className="mb-1 text-neutral-400 hover:text-red-600"
                    aria-label={`移除第 ${index + 1} 個連結`}
                  >
                    <i className="ti ti-trash" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </fieldset>

        {error && <p className="mb-3 text-xs text-red-600" role="alert">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          {isEditing && node && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`確定刪除「${node.title}」？此操作可以復原。`)) {
                  removeNode(storyline.id, node.id)
                  onClose()
                }
              }}
              className="btn-danger mr-auto"
            >
              刪除節點
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-secondary">
            取消
          </button>
          <button type="submit" className="btn-primary">
            {isEditing ? '儲存變更' : '新增節點'}
          </button>
        </div>
      </form>
    </div>
  )
}
