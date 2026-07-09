import { Toolbar } from './components/Toolbar/Toolbar'
import { StorylineLegend } from './components/Editor/StorylineLegend'
import { Timeline } from './components/Timeline/Timeline'
import { useUrlSync } from './lib/urlSync/useUrlSync'

function App() {
  useUrlSync()

  return (
    <div className="mx-auto max-w-6xl">
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
