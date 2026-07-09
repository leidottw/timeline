import { create } from 'zustand'
import type { Orientation, Storyline, TagMode, TimelineData, ViewportRange } from '../types'
import { getNodeSpan } from '../lib/date/historicalDate'
import initialData from '../data/timeline-data.json'

function computeFullRange(storylines: Storyline[]): ViewportRange {
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
  if (!isFinite(min) || !isFinite(max)) {
    return { start: 0, end: 100 }
  }
  const pad = Math.max((max - min) * 0.08, 2)
  return { start: min - pad, end: max + pad }
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
  addNode: (storylineId: string, node: Storyline['nodes'][number]) => void
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

export const useTimelineStore = create<TimelineState>((set, get) => ({
  storylines: initialStorylines,
  fullRange: initialFullRange,
  viewportRange: initialFullRange,
  orientation: 'horizontal',
  activeTags: [],
  tagMode: 'or',
  focusedNodeId: null,
  allTags: collectAllTags(initialStorylines),

  setViewportRange: (range) => set({ viewportRange: range }),

  resetViewport: () => set({ viewportRange: get().fullRange }),

  zoom: (factor, centerFraction = 0.5) => {
    const { viewportRange } = get()
    const span = viewportRange.end - viewportRange.start
    const center = viewportRange.start + span * centerFraction
    const newSpan = Math.max(span * factor, 0.5)
    set({
      viewportRange: {
        start: center - newSpan * centerFraction,
        end: center + newSpan * (1 - centerFraction),
      },
    })
  },

  pan: (deltaFraction) => {
    const { viewportRange } = get()
    const span = viewportRange.end - viewportRange.start
    const delta = span * deltaFraction
    set({
      viewportRange: {
        start: viewportRange.start + delta,
        end: viewportRange.end + delta,
      },
    })
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
    set((state) => {
      const storylines = [...state.storylines, s]
      return {
        storylines,
        fullRange: computeFullRange(storylines),
        allTags: collectAllTags(storylines),
      }
    }),

  updateStoryline: (id, patch) =>
    set((state) => ({
      storylines: state.storylines.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })),

  removeStoryline: (id) =>
    set((state) => {
      const storylines = state.storylines.filter((s) => s.id !== id)
      return {
        storylines,
        fullRange: computeFullRange(storylines),
        allTags: collectAllTags(storylines),
      }
    }),

  addNode: (storylineId, node) =>
    set((state) => {
      const storylines = state.storylines.map((s) =>
        s.id === storylineId ? { ...s, nodes: [...s.nodes, node] } : s
      )
      return {
        storylines,
        fullRange: computeFullRange(storylines),
        allTags: collectAllTags(storylines),
      }
    }),

  loadData: (data) => {
    const fullRange = computeFullRange(data.storylines)
    set({
      storylines: data.storylines,
      fullRange,
      viewportRange: fullRange,
      allTags: collectAllTags(data.storylines),
      activeTags: [],
      focusedNodeId: null,
    })
  },

  hydrateFromParams: ({ tags, tagMode, range, orientation, focus }) => {
    set({
      ...(tags ? { activeTags: tags } : {}),
      ...(tagMode ? { tagMode } : {}),
      ...(range ? { viewportRange: range } : {}),
      ...(orientation ? { orientation } : {}),
      ...(focus ? { focusedNodeId: focus } : {}),
    })
  },
}))
