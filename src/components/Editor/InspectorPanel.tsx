import { useTimelineStore } from '../../store/useTimelineStore'
import { NodeEditor } from './NodeEditor'
import { StorylineEditor } from './StorylineEditor'
import type { EditorSelection } from './editorSelection'

export function InspectorPanel({
  selection,
  onSelectionChange,
  onCollapse,
}: {
  selection: EditorSelection | null
  onSelectionChange: (selection: EditorSelection | null) => void
  onCollapse: () => void
}) {
  const storylines = useTimelineStore((state) => state.storylines)
  const closeSelection = () => onSelectionChange(null)

  let editor: React.ReactNode = null
  let editorKey = 'empty'

  if (selection?.type === 'new-storyline') {
    editorKey = 'new-storyline'
    editor = (
      <StorylineEditor
        mode="panel"
        onClose={closeSelection}
        onSaved={(storylineId) => onSelectionChange({ type: 'storyline', storylineId })}
      />
    )
  } else if (selection?.type === 'storyline') {
    const storyline = storylines.find((item) => item.id === selection.storylineId)
    if (storyline) {
      editorKey = `storyline-${storyline.id}`
      editor = <StorylineEditor mode="panel" storyline={storyline} onClose={closeSelection} />
    }
  } else if (selection?.type === 'new-node' || selection?.type === 'node') {
    const storyline = storylines.find((item) => item.id === selection.storylineId)
    const node =
      selection.type === 'node'
        ? storyline?.nodes.find((item) => item.id === selection.nodeId)
        : undefined
    if (storyline && (selection.type === 'new-node' || node)) {
      editorKey = selection.type === 'new-node' ? `new-node-${storyline.id}` : `node-${node!.id}`
      editor = (
        <NodeEditor
          mode="panel"
          storyline={storyline}
          node={node}
          onClose={closeSelection}
          onSaved={(nodeId) =>
            onSelectionChange({ type: 'node', storylineId: storyline.id, nodeId })
          }
        />
      )
    }
  }

  return (
    <aside className="workspace-sidebar workspace-sidebar-right" aria-label="內容編輯器">
      <div className="workspace-inspector-bar">
        <span>編輯器</span>
        <button type="button" onClick={onCollapse} className="workspace-icon-button" aria-label="收合編輯器" title="收合編輯器">
          <i className="ti ti-layout-sidebar-right-collapse" aria-hidden="true" />
        </button>
      </div>
      <div key={editorKey} className="min-h-0 flex-1 overflow-hidden">
        {editor ?? (
          <div className="workspace-inspector-empty">
            <i className="ti ti-edit-circle" aria-hidden="true" />
            <h2>選擇要編輯的內容</h2>
            <p>從左側選擇故事線或節點，編輯表單會顯示在這裡。</p>
          </div>
        )}
      </div>
    </aside>
  )
}
