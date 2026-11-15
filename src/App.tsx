import { useState } from 'react'
import { Toolbar } from './components/Toolbar/Toolbar'
import { StorylineSidebar } from './components/Editor/StorylineLegend'
import { InspectorPanel } from './components/Editor/InspectorPanel'
import type { EditorSelection } from './components/Editor/editorSelection'
import { Timeline } from './components/Timeline/Timeline'
import { useUrlSync } from './lib/urlSync/useUrlSync'
import { useTimelineStore } from './store/useTimelineStore'
import type { WorkspaceMode } from './types'

function App() {
  useUrlSync()
  const displayDensity = useTimelineStore((s) => s.displayDensity)
  const setFocusedNodeId = useTimelineStore((s) => s.setFocusedNodeId)
  const focusNodeOnCanvas = useTimelineStore((s) => s.focusNodeOnCanvas)
  const [mode, setMode] = useState<WorkspaceMode>('view')
  const [selection, setSelection] = useState<EditorSelection | null>(null)
  const [storylinesOpen, setStorylinesOpen] = useState(() => window.innerWidth >= 960)
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth >= 960)
  const [canvasFocusRequest, setCanvasFocusRequest] = useState({ nodeId: '', version: 0 })

  function selectEditor(nextSelection: EditorSelection) {
    setSelection(nextSelection)
    setInspectorOpen(true)
    if (nextSelection.type === 'node') setStorylinesOpen(true)
  }

  function selectSidebarNode(storylineId: string, nodeId: string) {
    selectEditor({ type: 'node', storylineId, nodeId })
    focusNodeOnCanvas(storylineId, nodeId)
    setCanvasFocusRequest((request) => ({ nodeId, version: request.version + 1 }))
  }

  function changeMode(nextMode: WorkspaceMode) {
    setMode(nextMode)
    setFocusedNodeId(null)
    if (nextMode === 'edit') {
      setStorylinesOpen(true)
      setInspectorOpen(true)
    }
  }

  const selectedNodeId = selection?.type === 'node' ? selection.nodeId : null

  return (
    <div className="timeline-app fixed inset-0 overflow-hidden p-2 sm:p-4" data-density={displayDensity}>
      <div className="h-full w-full">
        <div className="timeline-shell flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-black/10">
          <div className="shrink-0">
            <Toolbar
              mode={mode}
              onModeChange={changeMode}
              storylinesOpen={storylinesOpen}
              onToggleStorylines={() => setStorylinesOpen((open) => !open)}
              onAddStoryline={() => selectEditor({ type: 'new-storyline' })}
            />
          </div>
          <div className="timeline-workspace relative flex min-h-0 flex-1 overflow-hidden">
            {mode === 'edit' && storylinesOpen ? (
              <StorylineSidebar
                selection={selection}
                onSelect={selectEditor}
                onNodeSelect={selectSidebarNode}
                onCollapse={() => setStorylinesOpen(false)}
              />
            ) : mode === 'edit' ? (
              <div className="workspace-collapsed-rail workspace-collapsed-left">
                <button type="button" onClick={() => setStorylinesOpen(true)} aria-label="展開故事線側欄" title="展開故事線側欄">
                  <i className="ti ti-layout-sidebar-left-expand" aria-hidden="true" />
                </button>
              </div>
            ) : null}

            <main className="min-w-0 flex-1 px-2 pb-2 pt-1 sm:px-3 sm:pb-3">
              <Timeline
                mode={mode}
                selectedNodeId={selectedNodeId}
                focusRequest={canvasFocusRequest}
                onSelectNode={(storylineId, nodeId) =>
                  selectEditor({ type: 'node', storylineId, nodeId })
                }
              />
            </main>

            {mode === 'edit' && inspectorOpen ? (
              <InspectorPanel
                selection={selection}
                onSelectionChange={setSelection}
                onCollapse={() => setInspectorOpen(false)}
              />
            ) : mode === 'edit' ? (
              <div className="workspace-collapsed-rail workspace-collapsed-right">
                <button type="button" onClick={() => setInspectorOpen(true)} aria-label="展開編輯器" title="展開編輯器">
                  <i className="ti ti-layout-sidebar-right-expand" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
