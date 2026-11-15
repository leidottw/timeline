import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DisplayDensity, Storyline, TagMode, TimelineData, TimelineNode, ViewportRange } from '../types'
import { getNodeSpan } from '../lib/date/historicalDate'
import { parseTimelineData } from '../lib/validation/timelineData'
import { DEFAULT_DISPLAY_DENSITY, parseDisplayDensity } from '../lib/settings/displayDensity'
import { clampViewportRange, focusViewportRange, zoomViewportRange } from '../lib/viewport/range'
import initialData from '../data/timeline-data.json'

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

/** Navigable range: content plus enough blank space to give either edge breathing room. */
function computePanBounds(storylines: Storyline[]): ViewportRange {
  const extent = computeDataExtent(storylines)
  if (!extent) return { start: 0, end: 100 }
  const pad = Math.max((extent.max - extent.min) * 0.18, 4)
  return { start: extent.min - pad, end: extent.max + pad }
}

function getVisibleStorylines(storylines: Storyline[], hiddenIds: string[]): Storyline[] {
  const visible = storylines.filter((storyline) => !hiddenIds.includes(storyline.id))
  return visible.length > 0 ? visible : storylines
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
  panBounds: ViewportRange
  displayDensity: DisplayDensity
  hiddenStorylineIds: string[]
  activeTags: string[]
  tagMode: TagMode
  focusedNodeId: string | null
  allTags: string[]
  past: Storyline[][]
  future: Storyline[][]
  canvasResetVersion: number
  viewportAnimationVersion: number

  setViewportRange: (range: ViewportRange) => void
  animateViewportRange: (range: ViewportRange) => void
  resetViewport: () => void
  focusAllContent: () => void
  focusNodeOnCanvas: (storylineId: string, nodeId: string) => void
  animateZoom: (factor: number, centerFraction?: number) => void
  setDisplayDensity: (density: DisplayDensity) => void
  toggleStorylineVisibility: (id: string) => void
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
  resetToDefault: () => void
  undo: () => void
  redo: () => void
  hydrateFromParams: (params: {
    tags?: string[]
    tagMode?: TagMode
    range?: ViewportRange
    focus?: string
  }) => void
}

const initialStorylines = initialData.storylines as Storyline[]
const initialFullRange = computeFullRange(initialStorylines)

/** Recompute data-derived metadata after edits while preserving the user's current canvas position. */
function withRecomputedRanges(
  storylines: Storyline[],
  viewportRange: ViewportRange,
  activeTags?: string[],
  hiddenStorylineIds: string[] = []
) {
  const allTags = collectAllTags(storylines)
  const panBounds = computePanBounds(getVisibleStorylines(storylines, hiddenStorylineIds))
  return {
    storylines,
    fullRange: computeFullRange(storylines),
    viewportRange: clampViewportRange(viewportRange, panBounds),
    panBounds,
    allTags,
    ...(activeTags ? { activeTags: activeTags.filter((tag) => allTags.includes(tag)) } : {}),
  }
}

const HISTORY_LIMIT = 50

function commitStorylines(state: TimelineState, storylines: Storyline[]) {
  return {
    ...withRecomputedRanges(
      storylines,
      state.viewportRange,
      state.activeTags,
      state.hiddenStorylineIds
    ),
    past: [...state.past, state.storylines].slice(-HISTORY_LIMIT),
    future: [],
  }
}

export const useTimelineStore = create<TimelineState>()(persist((set, get) => ({
  storylines: initialStorylines,
  fullRange: initialFullRange,
  viewportRange: initialFullRange,
  panBounds: computePanBounds(initialStorylines),
  displayDensity: DEFAULT_DISPLAY_DENSITY,
  hiddenStorylineIds: [],
  activeTags: [],
  tagMode: 'or',
  focusedNodeId: null,
  allTags: collectAllTags(initialStorylines),
  past: [],
  future: [],
  canvasResetVersion: 0,
  viewportAnimationVersion: 0,

  setViewportRange: (range) =>
    set((state) => ({ viewportRange: clampViewportRange(range, state.panBounds) })),

  animateViewportRange: (range) =>
    set((state) => ({
      viewportRange: clampViewportRange(range, state.panBounds),
      viewportAnimationVersion: state.viewportAnimationVersion + 1,
    })),

  resetViewport: () =>
    set((state) => ({
      viewportRange: clampViewportRange(get().fullRange, state.panBounds),
      canvasResetVersion: state.canvasResetVersion + 1,
      viewportAnimationVersion: state.viewportAnimationVersion + 1,
    })),

  focusAllContent: () =>
    set((state) => {
      const visibleStorylines = getVisibleStorylines(
        state.storylines,
        state.hiddenStorylineIds
      )
      return {
        viewportRange: clampViewportRange(computeFullRange(visibleStorylines), state.panBounds),
        canvasResetVersion: state.canvasResetVersion + 1,
        viewportAnimationVersion: state.viewportAnimationVersion + 1,
      }
    }),

  focusNodeOnCanvas: (storylineId, nodeId) =>
    set((state) => {
      const storyline = state.storylines.find((item) => item.id === storylineId)
      const node = storyline?.nodes.find((item) => item.id === nodeId)
      if (!node) return state

      try {
        const [start, end] = getNodeSpan(node)
        const hiddenStorylineIds = state.hiddenStorylineIds.filter((id) => id !== storylineId)
        const panBounds = computePanBounds(
          getVisibleStorylines(state.storylines, hiddenStorylineIds)
        )
        return {
          hiddenStorylineIds,
          panBounds,
          viewportRange: clampViewportRange(
            focusViewportRange(state.viewportRange, start, end),
            panBounds
          ),
          viewportAnimationVersion: state.viewportAnimationVersion + 1,
        }
      } catch {
        return state
      }
    }),

  animateZoom: (factor, centerFraction = 0.5) => {
    set((state) => ({
      viewportRange: clampViewportRange(
        zoomViewportRange(state.viewportRange, factor, centerFraction),
        state.panBounds
      ),
      viewportAnimationVersion: state.viewportAnimationVersion + 1,
    }))
  },

  setDisplayDensity: (displayDensity) => set({ displayDensity }),

  toggleStorylineVisibility: (id) =>
    set((state) => {
      const hiddenStorylineIds = state.hiddenStorylineIds.includes(id)
        ? state.hiddenStorylineIds.filter((storylineId) => storylineId !== id)
        : [...state.hiddenStorylineIds, id]
      const panBounds = computePanBounds(
        getVisibleStorylines(state.storylines, hiddenStorylineIds)
      )
      return {
        hiddenStorylineIds,
        panBounds,
        viewportRange: clampViewportRange(state.viewportRange, panBounds),
      }
    }),

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
    set((state) => commitStorylines(state, [...state.storylines, s])),

  updateStoryline: (id, patch) =>
    set((state) =>
      commitStorylines(
        state,
        state.storylines.map((s) => (s.id === id ? { ...s, ...patch } : s))
      )
    ),

  removeStoryline: (id) =>
    set((state) => ({
      ...commitStorylines(state, state.storylines.filter((s) => s.id !== id)),
      hiddenStorylineIds: state.hiddenStorylineIds.filter((storylineId) => storylineId !== id),
      focusedNodeId: state.storylines
        .find((storyline) => storyline.id === id)
        ?.nodes.some((node) => node.id === state.focusedNodeId)
        ? null
        : state.focusedNodeId,
    })),

  addNode: (storylineId, node) =>
    set((state) =>
      commitStorylines(
        state,
        state.storylines.map((s) => (s.id === storylineId ? { ...s, nodes: [...s.nodes, node] } : s)),
      )
    ),

  updateNode: (storylineId, nodeId, patch) =>
    set((state) =>
      commitStorylines(
        state,
        state.storylines.map((s) =>
          s.id === storylineId
            ? { ...s, nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) }
            : s
        )
      )
    ),

  removeNode: (storylineId, nodeId) =>
    set((state) => ({
      ...commitStorylines(
        state,
        state.storylines.map((s) =>
          s.id === storylineId ? { ...s, nodes: s.nodes.filter((n) => n.id !== nodeId) } : s
        )
      ),
      focusedNodeId: state.focusedNodeId === nodeId ? null : state.focusedNodeId,
    })),

  loadData: (data) => {
    const fullRange = computeFullRange(data.storylines)
    const panBounds = computePanBounds(data.storylines)
    set((state) => ({
      ...commitStorylines(state, data.storylines),
      fullRange,
      panBounds,
      viewportRange: clampViewportRange(fullRange, panBounds),
      activeTags: [],
      focusedNodeId: null,
      hiddenStorylineIds: [],
      canvasResetVersion: state.canvasResetVersion + 1,
    }))
  },

  resetToDefault: () => {
    const storylines = initialData.storylines as Storyline[]
    const fullRange = computeFullRange(storylines)
    const panBounds = computePanBounds(storylines)
    set((state) => ({
      ...commitStorylines(state, storylines),
      fullRange,
      panBounds,
      viewportRange: clampViewportRange(fullRange, panBounds),
      activeTags: [],
      focusedNodeId: null,
      hiddenStorylineIds: [],
      canvasResetVersion: state.canvasResetVersion + 1,
    }))
  },

  undo: () =>
    set((state) => {
      const previous = state.past.at(-1)
      if (!previous) return state
      return {
        ...withRecomputedRanges(
          previous,
          state.viewportRange,
          state.activeTags,
          state.hiddenStorylineIds
        ),
        past: state.past.slice(0, -1),
        future: [state.storylines, ...state.future].slice(0, HISTORY_LIMIT),
        focusedNodeId: null,
      }
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0]
      if (!next) return state
      return {
        ...withRecomputedRanges(
          next,
          state.viewportRange,
          state.activeTags,
          state.hiddenStorylineIds
        ),
        past: [...state.past, state.storylines].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        focusedNodeId: null,
      }
    }),

  hydrateFromParams: ({ tags, tagMode, range, focus }) => {
    set((state) => ({
      ...(tags ? { activeTags: tags } : {}),
      ...(tagMode ? { tagMode } : {}),
      ...(range ? { viewportRange: clampViewportRange(range, state.panBounds) } : {}),
      ...(focus ? { focusedNodeId: focus } : {}),
    }))
  },
}), {
  name: 'historical-timeline-data',
  version: 1,
  partialize: (state) => ({
    storylines: state.storylines,
    displayDensity: state.displayDensity,
    hiddenStorylineIds: state.hiddenStorylineIds,
  }),
  merge: (persistedState, currentState) => {
    try {
      const persisted = persistedState as {
        storylines?: unknown
        displayDensity?: unknown
        hiddenStorylineIds?: unknown
      }
      const data = parseTimelineData({ storylines: persisted.storylines })
      const fullRange = computeFullRange(data.storylines)
      const hiddenStorylineIds = Array.isArray(persisted.hiddenStorylineIds)
        ? persisted.hiddenStorylineIds.filter(
            (id): id is string =>
              typeof id === 'string' && data.storylines.some((storyline) => storyline.id === id)
          )
        : currentState.hiddenStorylineIds
      return {
        ...currentState,
        ...withRecomputedRanges(data.storylines, fullRange, undefined, hiddenStorylineIds),
        displayDensity: parseDisplayDensity(persisted.displayDensity) ?? currentState.displayDensity,
        hiddenStorylineIds,
        past: [],
        future: [],
      }
    } catch {
      return currentState
    }
  },
}))
