import { create } from 'zustand'
import type { Orientation, Storyline, TagMode, TimelineData, TimelineNode, ViewportRange } from '../types'
import { getNodeSpan } from '../lib/date/historicalDate'
import initialData from '../data/timeline-data.json'

/** smallest allowed viewport span (max zoom-in) */
const MIN_VIEWPORT_SPAN = 0.5

function computeDataExtent(storylines: Storyline[]): { min: number; max: number } | null {
  let min = Infinity
  let max = -Infinity
  for (const storyline of storylines) {
    for (const node of storyline.nodes) {
      try {
        const [start, end] = getNodeSpan(node)
        min = Math.min(min, start)
        max = Math.max(max, end)
      } catch {
        // node without valid time, skip
      }
    }
  }
  return isFinite(min) && isFinite(max) ? { min, max } : null
}

/** default view: data span + 8% padding, framed a bit loosely for a nice initial look */
function computeFullRange(storylines: Storyline[]): ViewportRange {
  const extent = computeDataExtent(storylines)
  if (!extent) return { start: 0, end: 100 }
  const pad = Math.max((extent.max - extent.min) * 0.08, 2)
  return { start: extent.min - pad, end: extent.max + pad }
}

/** hard zoom/pan limit: data span + 10% total, so users can't scroll or zoom out into empty space */
function computePanBounds(storylines: Storyline[]): ViewportRange {
  const extent = computeDataExtent(storylines)
  if (!extent) return { start: 0, end: 100 }
  const span = extent.max - extent.min
  const pad = Math.max(span * 0.05, 1)
  return { start: extent.min - pad, end: extent.max + pad }
}

/** Clamp a candidate viewport to stay within `bounds`, keeping its span between MIN_VIEWPORT_SPAN and the full bounds width. */
function clampViewportRange(range: ViewportRange, bounds: ViewportRange): ViewportRange {
  const boundsWidth = Math.max(bounds.end - bounds.start, MIN_VIEWPORT_SPAN)
  const span = Math.min(Math.max(range.end - range.start, MIN_VIEWPORT_SPAN), boundsWidth)
  let start = range.start
  if (start < bounds.start) start = bounds.start
  if (start + span > bounds.end) start = bounds.end - span
  return { start, end: start + span }
}

function collectAllTags(storylines: Storyline[]): string[] {
  const set = new Set<string>()
  for (const storyline of storylines) {
    for (const node of storyline.nodes) {
      node.tags?.forEach((t) => set.add(t))
    }
  }
  return Array.from(set).sort()
}

interface TimelineState {
  storylines: Storyline[]
  fullRange: ViewportRange
  /** hard limit on how far the viewport can zoom out or pan to — data span + 10% */
  panBounds: ViewportRange
  viewportRange: ViewportRange
  orientation: Orientation
  activeTags: string[]
  tagMode: TagMode
  focusedNodeId: string | null
  allTags: string[]

  setViewportRange: (range: ViewportRange) => void
  resetViewport: () => void
  zoom: (factor: number, centerFraction?: number) => void
  pan: (deltaFraction: number) => void
  setOrientation: (o: Orientation) => void
  toggleTag: (tag: string) => void
  clearTags: () => void
  setTagMode: (m: TagMode) => void
  setFocusedNodeId: (id: string | null) => void
  addStoryline: (s: Storyline) => void
  updateStoryline: (id: string, patch: Partial<Storyline>) => void
  removeStoryline: (id: string) => void
  addNode: (storylineId: string, node: TimelineNode) => void
  updateNode: (storylineId: string, nodeId: string, patch: Partial<TimelineNode>) => void
  removeNode: (storylineId: string, nodeId: string) => void
  loadData: (data: TimelineData) => void
  hydrateFromParams: (params: {
    tags?: string[]
    tagMode?: TagMode
    range?: ViewportRange
    orientation?: Orientation
    focus?: string
  }) => void
}

const initialStorylines = initialData.storylines as Storyline[]
const initialFullRange = computeFullRange(initialStorylines)
const initialPanBounds = computePanBounds(initialStorylines)

/** Recompute the data-derived ranges after any edit to storylines/nodes, re-clamping the current viewport in case it no longer fits. */
function withRecomputedRanges(storylines: Storyline[], viewportRange: ViewportRange) {
  const panBounds = computePanBounds(storylines)
  return {
    storylines,
    fullRange: computeFullRange(storylines),
    panBounds,
    viewportRange: clampViewportRange(viewportRange, panBounds),
    allTags: collectAllTags(storylines),
  }
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  storylines: initialStorylines,
  fullRange: initialFullRange,
  panBounds: initialPanBounds,
  viewportRange: initialFullRange,
  orientation: 'horizontal',
  activeTags: [],
  tagMode: 'or',
  focusedNodeId: null,
  allTags: collectAllTags(initialStorylines),

  setViewportRange: (range) => set((state) => ({ viewportRange: clampViewportRange(range, state.panBounds) })),

  resetViewport: () => set({ viewportRange: get().fullRange }),

  zoom: (factor, centerFraction = 0.5) => {
    const { viewportRange, panBounds } = get()
    const span = viewportRange.end - viewportRange.start
    const center = viewportRange.start + span * centerFraction
    const newSpan = span * factor
    const range = {
      start: center - newSpan * centerFraction,
      end: center + newSpan * (1 - centerFraction),
    }
    set({ viewportRange: clampViewportRange(range, panBounds) })
  },

  pan: (deltaFraction) => {
    const { viewportRange, panBounds } = get()
    const span = viewportRange.end - viewportRange.start
    const delta = span * deltaFraction
    const range = { start: viewportRange.start + delta, end: viewportRange.end + delta }
    set({ viewportRange: clampViewportRange(range, panBounds) })
  },

  setOrientation: (o) => set({ orientation: o }),

  toggleTag: (tag) => {
    const { activeTags } = get()
    set({
      activeTags: activeTags.includes(tag)
        ? activeTags.filter((t) => t !== tag)
        : [...activeTags, tag],
    })
  },

  clearTags: () => set({ activeTags: [] }),

  setTagMode: (m) => set({ tagMode: m }),

  setFocusedNodeId: (id) => set({ focusedNodeId: id }),

  addStoryline: (s) =>
    set((state) => withRecomputedRanges([...state.storylines, s], state.viewportRange)),

  updateStoryline: (id, patch) =>
    set((state) => ({
      storylines: state.storylines.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })),

  removeStoryline: (id) =>
    set((state) =>
      withRecomputedRanges(
        state.storylines.filter((s) => s.id !== id),
        state.viewportRange
      )
    ),

  addNode: (storylineId, node) =>
    set((state) =>
      withRecomputedRanges(
        state.storylines.map((s) => (s.id === storylineId ? { ...s, nodes: [...s.nodes, node] } : s)),
        state.viewportRange
      )
    ),

  updateNode: (storylineId, nodeId, patch) =>
    set((state) =>
      withRecomputedRanges(
        state.storylines.map((s) =>
          s.id === storylineId
            ? { ...s, nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) }
            : s
        ),
        state.viewportRange
      )
    ),

  removeNode: (storylineId, nodeId) =>
    set((state) => ({
      ...withRecomputedRanges(
        state.storylines.map((s) =>
          s.id === storylineId ? { ...s, nodes: s.nodes.filter((n) => n.id !== nodeId) } : s
        ),
        state.viewportRange
      ),
      focusedNodeId: state.focusedNodeId === nodeId ? null : state.focusedNodeId,
    })),

  loadData: (data) => {
    const fullRange = computeFullRange(data.storylines)
    set({
      storylines: data.storylines,
      fullRange,
      panBounds: computePanBounds(data.storylines),
      viewportRange: fullRange,
      allTags: collectAllTags(data.storylines),
      activeTags: [],
      focusedNodeId: null,
    })
  },

  hydrateFromParams: ({ tags, tagMode, range, orientation, focus }) => {
    set((state) => ({
      ...(tags ? { activeTags: tags } : {}),
      ...(tagMode ? { tagMode } : {}),
      ...(range ? { viewportRange: clampViewportRange(range, state.panBounds) } : {}),
      ...(orientation ? { orientation } : {}),
      ...(focus ? { focusedNodeId: focus } : {}),
    }))
  },
}))
