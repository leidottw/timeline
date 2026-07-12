import { Toolbar } from './components/Toolbar/Toolbar'
import { StorylineLegend } from './components/Editor/StorylineLegend'
import { Timeline } from './components/Timeline/Timeline'
import { useUrlSync } from './lib/urlSync/useUrlSync'
import { useTimelineStore } from './store/useTimelineStore'

function App() {
  useUrlSync()
  const orientation = useTimelineStore((s) => s.orientation)
  // Horizontal mode benefits from using the full viewport width (more room
  // per pixel-year, less crowding); vertical mode stays capped for readability.
  const containerClass = orientation === 'horizontal' ? 'w-full px-4' : 'mx-auto max-w-6xl'

  return (
    <div className={containerClass}>
      <div className="mt-4 overflow-hidden rounded-xl border border-black/10 bg-white">
        <Toolbar />
        <StorylineLegend />
        <div className="px-4 pb-5 pt-2">
          <Timeline />
        </div>
      </div>
    </div>
  )
}

export default App
