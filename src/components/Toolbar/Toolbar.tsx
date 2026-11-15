import { useEffect, useRef, useState } from 'react'
import { useTimelineStore } from '../../store/useTimelineStore'
import type { TimelineData, WorkspaceMode } from '../../types'
import { parseTimelineData } from '../../lib/validation/timelineData'

export function Toolbar({
  mode,
  onModeChange,
  storylinesOpen,
  onToggleStorylines,
  onAddStoryline,
}: {
  mode: WorkspaceMode
  onModeChange: (mode: WorkspaceMode) => void
  storylinesOpen: boolean
  onToggleStorylines: () => void
  onAddStoryline: () => void
}) {
  const allTags = useTimelineStore((s) => s.allTags)
  const activeTags = useTimelineStore((s) => s.activeTags)
  const tagMode = useTimelineStore((s) => s.tagMode)
  const toggleTag = useTimelineStore((s) => s.toggleTag)
  const clearTags = useTimelineStore((s) => s.clearTags)
  const setTagMode = useTimelineStore((s) => s.setTagMode)
  const displayDensity = useTimelineStore((s) => s.displayDensity)
  const setDisplayDensity = useTimelineStore((s) => s.setDisplayDensity)
  const animateZoom = useTimelineStore((s) => s.animateZoom)
  const focusAllContent = useTimelineStore((s) => s.focusAllContent)
  const storylines = useTimelineStore((s) => s.storylines)
  const hiddenStorylineIds = useTimelineStore((s) => s.hiddenStorylineIds)
  const toggleStorylineVisibility = useTimelineStore((s) => s.toggleStorylineVisibility)
  const loadData = useTimelineStore((s) => s.loadData)
  const resetToDefault = useTimelineStore((s) => s.resetToDefault)
  const undo = useTimelineStore((s) => s.undo)
  const redo = useTimelineStore((s) => s.redo)
  const canUndo = useTimelineStore((s) => s.past.length > 0)
  const canRedo = useTimelineStore((s) => s.future.length > 0)

  const [showTagPicker, setShowTagPicker] = useState(false)
  const [showStorylinePicker, setShowStorylinePicker] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tagPickerRef = useRef<HTMLDivElement>(null)
  const storylinePickerRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!showStorylinePicker) return
    function handlePointerDown(e: PointerEvent) {
      if (storylinePickerRef.current && !storylinePickerRef.current.contains(e.target as Node)) {
        setShowStorylinePicker(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [showStorylinePicker])

  useEffect(() => {
    if (mode === 'edit') setShowStorylinePicker(false)
  }, [mode])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [redo, undo])

  function exportJson() {
    const data: TimelineData = { schemaVersion: 1, storylines }
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
    setMessage(null)
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: '檔案超過 5 MB，請縮小後再匯入。' })
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = parseTimelineData(JSON.parse(reader.result as string))
        if (!window.confirm(`匯入後將以 ${data.storylines.length} 條故事線取代目前資料，確定繼續？`)) return
        loadData(data)
        setMessage({ type: 'success', text: '資料已匯入並自動儲存。' })
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? `匯入失敗：${error.message}` : 'JSON 檔案格式錯誤。',
        })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-black/10 px-4 py-2.5">
      <span className="mr-2 text-[15px] font-medium">歷史時間軸</span>

      <div className="workspace-mode-toggle" role="group" aria-label="操作模式">
        <button
          type="button"
          className={mode === 'view' ? 'is-active' : ''}
          aria-pressed={mode === 'view'}
          onClick={() => onModeChange('view')}
        >
          <i className="ti ti-eye" aria-hidden="true" />
          檢視
        </button>
        <button
          type="button"
          className={mode === 'edit' ? 'is-active' : ''}
          aria-pressed={mode === 'edit'}
          onClick={() => onModeChange('edit')}
        >
          <i className="ti ti-pencil" aria-hidden="true" />
          編輯
        </button>
      </div>

      {mode === 'edit' && (
        <button
          type="button"
          onClick={onToggleStorylines}
          className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs ${storylinesOpen ? 'bg-blue-50 text-blue-700' : 'bg-neutral-100 text-neutral-500'}`}
          aria-pressed={storylinesOpen}
          title={storylinesOpen ? '收合故事線側欄' : '展開故事線側欄'}
        >
          <i className="ti ti-layout-sidebar-left" aria-hidden="true" />
          故事線
        </button>
      )}

      {mode === 'view' && (
        <div className="relative" ref={storylinePickerRef}>
          <button
            type="button"
            onClick={() => setShowStorylinePicker((open) => !open)}
            className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs ${hiddenStorylineIds.length > 0 ? 'bg-amber-50 text-amber-800' : 'bg-neutral-100 text-neutral-600'}`}
            aria-expanded={showStorylinePicker}
            aria-haspopup="menu"
            title="選擇要顯示的故事線"
          >
            <i className="ti ti-list-tree" aria-hidden="true" />
            故事線
            {hiddenStorylineIds.length > 0 && (
              <span className="rounded-full bg-white/80 px-1.5 text-[10px]">
                隱藏 {hiddenStorylineIds.length}
              </span>
            )}
          </button>

          {showStorylinePicker && (
            <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-black/10 bg-white p-2 shadow-xl" role="menu">
              <div className="mb-1 flex items-center justify-between px-1 py-1">
                <span className="text-xs font-medium text-neutral-700">故事線顯示</span>
                {hiddenStorylineIds.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:text-blue-800"
                    onClick={() => hiddenStorylineIds.forEach(toggleStorylineVisibility)}
                  >
                    全部顯示
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto overscroll-contain">
                {storylines.map((storyline) => {
                  const visible = !hiddenStorylineIds.includes(storyline.id)
                  return (
                    <button
                      type="button"
                      key={storyline.id}
                      role="menuitemcheckbox"
                      aria-checked={visible}
                      onClick={() => toggleStorylineVisibility(storyline.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-100"
                    >
                      <i className={`ti ${visible ? 'ti-eye text-blue-600' : 'ti-eye-off text-neutral-400'}`} aria-hidden="true" />
                      <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: storyline.color }} />
                      <span className="min-w-0 flex-1 truncate">{storyline.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="relative" ref={tagPickerRef}>
        <div className="flex max-w-full flex-wrap items-center gap-1.5 rounded-md bg-neutral-100 px-2.5 py-1.5">
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
            aria-expanded={showTagPicker}
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

      {mode === 'edit' && (
      <div className="flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-1.5">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="toolbar-icon-button"
          aria-label="復原"
          title="復原（Ctrl/⌘ Z）"
        >
          <i className="ti ti-arrow-back-up text-[15px]" aria-hidden="true" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="toolbar-icon-button"
          aria-label="重做"
          title="重做（Ctrl/⌘ Shift Z）"
        >
          <i className="ti ti-arrow-forward-up text-[15px]" aria-hidden="true" />
        </button>
        <span className="ml-1 text-[10px] text-emerald-700">自動儲存</span>
      </div>
      )}

      <div className="density-toggle" role="group" aria-label="顯示密度">
        <button
          onClick={() => setDisplayDensity('comfortable')}
          className={displayDensity === 'comfortable' ? 'is-active' : ''}
          aria-pressed={displayDensity === 'comfortable'}
        >
          舒適
        </button>
        <button
          onClick={() => setDisplayDensity('compact')}
          className={displayDensity === 'compact' ? 'is-active' : ''}
          aria-pressed={displayDensity === 'compact'}
        >
          緊湊
        </button>
      </div>

      <div className="flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-1.5">
        <button onClick={() => animateZoom(1.3)} className="toolbar-icon-button" aria-label="縮小">
          <i className="ti ti-zoom-out text-[15px] text-neutral-500" aria-hidden="true" />
        </button>
        <button onClick={() => animateZoom(1 / 1.3)} className="toolbar-icon-button" aria-label="放大">
          <i className="ti ti-zoom-in text-[15px] text-neutral-500" aria-hidden="true" />
        </button>
        <button
          onClick={focusAllContent}
          className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-white hover:text-neutral-800"
          title="自動縮放並置中所有可見內容"
        >
          <i className="ti ti-focus-2 text-[15px]" aria-hidden="true" />
          聚焦全部
        </button>
      </div>

      <button
        onClick={exportJson}
        className="flex items-center gap-1 rounded-md border border-black/10 px-2.5 py-1.5 text-xs hover:bg-neutral-50"
      >
        <i className="ti ti-download text-sm" aria-hidden="true" />
        匯出
      </button>
      {mode === 'edit' && (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 rounded-md border border-black/10 px-2.5 py-1.5 text-xs hover:bg-neutral-50"
        >
          <i className="ti ti-upload text-sm" aria-hidden="true" />
          匯入
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={importJson} />

      {mode === 'edit' && (
        <button
          onClick={onAddStoryline}
          className="flex items-center gap-1 rounded-md border border-black/10 px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-50"
        >
          <i className="ti ti-plus text-sm" aria-hidden="true" />
          新增故事線
        </button>
      )}

      {mode === 'edit' && (
        <button
          onClick={() => {
            if (window.confirm('確定恢復內建示範資料？目前內容仍可使用復原取回。')) {
              resetToDefault()
              setMessage({ type: 'success', text: '已恢復示範資料，可使用復原取回先前內容。' })
            }
          }}
          className="text-xs text-neutral-400 hover:text-red-600"
        >
          恢復預設
        </button>
      )}

      {message && (
        <p
          className={`w-full text-right text-xs ${message.type === 'error' ? 'text-red-600' : 'text-emerald-700'}`}
          role={message.type === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
