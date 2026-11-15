import { useEffect, useRef } from 'react'
import debounce from 'lodash.debounce'
import { useTimelineStore } from '../../store/useTimelineStore'
import type { TagMode } from '../../types'

function parseParams(): {
  tags?: string[]
  tagMode?: TagMode
  range?: { start: number; end: number }
  focus?: string
} {
  const params = new URLSearchParams(window.location.search)
  const tagsParam = params.get('tags')
  const tagModeParam = params.get('tagMode')
  const rangeParam = params.get('range')
  const focusParam = params.get('focus')

  let range: { start: number; end: number } | undefined
  if (rangeParam) {
    const [start, end] = rangeParam.split(',').map(Number)
    if (!isNaN(start) && !isNaN(end)) range = { start, end }
  }

  return {
    tags: tagsParam ? tagsParam.split(',').filter(Boolean) : undefined,
    tagMode: tagModeParam === 'and' || tagModeParam === 'or' ? tagModeParam : undefined,
    range,
    focus: focusParam ?? undefined,
  }
}

/**
 * Reads filter/viewport/focus state from the URL on mount,
 * and writes state changes back to the URL (debounced, via replaceState)
 * so the current view can be shared as a link.
 */
export function useUrlSync() {
  const hydrateFromParams = useTimelineStore((s) => s.hydrateFromParams)
  const hydrated = useRef(false)

  const activeTags = useTimelineStore((s) => s.activeTags)
  const tagMode = useTimelineStore((s) => s.tagMode)
  const viewportRange = useTimelineStore((s) => s.viewportRange)
  const focusedNodeId = useTimelineStore((s) => s.focusedNodeId)

  useEffect(() => {
    hydrateFromParams(parseParams())
    hydrated.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const writeUrl = useRef(
    debounce(
      (state: {
        activeTags: string[]
        tagMode: TagMode
        viewportRange: { start: number; end: number }
        focusedNodeId: string | null
      }) => {
        const params = new URLSearchParams()
        if (state.activeTags.length > 0) params.set('tags', state.activeTags.join(','))
        if (state.tagMode !== 'or') params.set('tagMode', state.tagMode)
        params.set(
          'range',
          `${state.viewportRange.start.toFixed(2)},${state.viewportRange.end.toFixed(2)}`
        )
        if (state.focusedNodeId) params.set('focus', state.focusedNodeId)

        const newUrl = `${window.location.pathname}?${params.toString()}`
        window.history.replaceState(null, '', newUrl)
      },
      350
    )
  ).current

  useEffect(() => {
    if (!hydrated.current) return
    writeUrl({ activeTags, tagMode, viewportRange, focusedNodeId })
  }, [activeTags, tagMode, viewportRange, focusedNodeId, writeUrl])
}
