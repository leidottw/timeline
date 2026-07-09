import { useEffect, useRef, useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import type { TimelineData } from '../../types'
import { StorylineEditor } from '../Editor/StorylineEditor'

export function Toolbar() {
  const allTags = useTimelineStore((s) => s.allTags)
  const activeTags = useTimelineStore((s) => s.activeTags)
  const tagMode = useTimelineStore((s) => s.tagMode)
  const toggleTag = useTimelineStore((s) => s.toggleTag)
  const clearTags = useTimelineStore((s) => s.clearTags)
  const setTagMode = useTimelineStore((s) => s.setTagMode)
  const orientation = useTimelineStore((s) => s.orientation)
  const setOrientation = useTimelineStore((s) => s.setOrientation)
  const zoom = useTimelineStore((s) => s.zoom)
  const resetViewport = useTimelineStore((s) => s.resetViewport)
  const storylines = useTimelineStore((s) => s.storylines)
  const loadData = useTimelineStore((s) => s.loadData)

  const [showEditor, setShowEditor] = useState(false)
  const [showTagPicker, setShowTagPicker] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tagPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showTagPicker) return
    function handlePointerDown(e: PointerEvent) {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setShowTagPicker(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [showTagPicker])

  function exportJson() {
    const data: TimelineData = { storylines }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'timeline-data.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as TimelineData
        loadData(data)
      } catch {
        alert('JSON 檔案格式錯誤，無法匯入。')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-black/10 px-4 py-2.5">
      <span className="mr-2 text-[15px] font-medium">歷史時間軸</span>

      <div className="relative" ref={tagPickerRef}>
        <div className="flex items-center gap-1.5 rounded-md bg-neutral-100 px-2.5 py-1.5">
          <i className="ti ti-filter text-[15px] text-neutral-500" aria-hidden="true" />
          <span className="text-xs text-neutral-500">篩選:</span>
          {activeTags.length === 0 && (
            <span className="text-xs text-neutral-400">未套用</span>
          )}
          {activeTags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-800"
            >
              {tag}
              <button onClick={() => toggleTag(tag)} aria-label={`移除標籤 ${tag}`}>
                <i className="ti ti-x text-[10px]" aria-hidden="true" />
              </button>
            </span>
          ))}
          <button
            onClick={() => setShowTagPicker((v) => !v)}
            className="text-xs text-neutral-400 hover:text-neutral-700"
          >
            + 新增標籤
          </button>
          {activeTags.length > 0 && (
            <>
              <span className="mx-1 h-3 w-px bg-black/10" />
              <button
                onClick={() => setTagMode(tagMode === 'or' ? 'and' : 'or')}
                className="text-xs text-neutral-500 hover:text-neutral-800"
                title="切換符合任一 / 符合全部"
              >
                {tagMode === 'or' ? '符合任一' : '符合全部'}
              </button>
              <button onClick={clearTags} className="text-xs text-neutral-400 hover:text-neutral-700">
                清除
              </button>
            </>
          )}
        </div>

        {showTagPicker && (
          <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-black/10 bg-white p-2 shadow-lg">
            {allTags.length === 0 && <p className="p-1 text-xs text-neutral-400">尚無任何標籤</p>}
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    activeTags.includes(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-1.5 text-xs">
        <button
          onClick={() => setOrientation('horizontal')}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${
            orientation === 'horizontal' ? 'font-medium text-blue-700' : 'text-neutral-400'
          }`}
        >
          <i className="ti ti-arrows-horizontal text-[15px]" aria-hidden="true" />
          水平
        </button>
        <span className="text-neutral-300">/</span>
        <button
          onClick={() => setOrientation('vertical')}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${
            orientation === 'vertical' ? 'font-medium text-blue-700' : 'text-neutral-400'
          }`}
        >
          <i className="ti ti-arrows-vertical text-[15px]" aria-hidden="true" />
          垂直
        </button>
      </div>

      <div className="flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-1.5">
        <button onClick={() => zoom(1.3)} aria-label="縮小">
          <i className="ti ti-zoom-out text-[15px] text-neutral-500" aria-hidden="true" />
        </button>
        <button onClick={() => zoom(1 / 1.3)} aria-label="放大">
          <i className="ti ti-zoom-in text-[15px] text-neutral-500" aria-hidden="true" />
        </button>
        <button onClick={resetViewport} className="ml-1 text-xs text-neutral-500 hover:text-neutral-800">
          重設視圖
        </button>
      </div>

      <button
        onClick={exportJson}
        className="flex items-center gap-1 rounded-md border border-black/10 px-2.5 py-1.5 text-xs hover:bg-neutral-50"
      >
        <i className="ti ti-download text-sm" aria-hidden="true" />
        匯出
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1 rounded-md border border-black/10 px-2.5 py-1.5 text-xs hover:bg-neutral-50"
      >
        <i className="ti ti-upload text-sm" aria-hidden="true" />
        匯入
      </button>
      <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={importJson} />

      <button
        onClick={() => setShowEditor(true)}
        className="flex items-center gap-1 rounded-md border border-black/10 px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-50"
      >
        <i className="ti ti-plus text-sm" aria-hidden="true" />
        新增故事線
      </button>

      {showEditor && <StorylineEditor onClose={() => setShowEditor(false)} />}
    </div>
  )
}
