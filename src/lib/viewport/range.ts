import type { ViewportRange } from '../../types'

export const MIN_VIEWPORT_SPAN = 1 / 365
export const MAX_VIEWPORT_SPAN = 1_000_000_000

const FALLBACK_RANGE: ViewportRange = { start: 0, end: 100 }

/** Keep viewport numbers safe without constraining where the user may pan. */
export function normalizeViewportRange(
  range: ViewportRange,
  fallback: ViewportRange = FALLBACK_RANGE
): ViewportRange {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) {
    return fallback
  }
  const rawSpan = range.end - range.start
  const span = Math.min(Math.max(rawSpan, MIN_VIEWPORT_SPAN), MAX_VIEWPORT_SPAN)
  if (span === rawSpan) return range
  const center = range.start + rawSpan / 2
  return { start: center - span / 2, end: center + span / 2 }
}

export function zoomViewportRange(
  range: ViewportRange,
  factor: number,
  centerFraction = 0.5
): ViewportRange {
  const safeRange = normalizeViewportRange(range)
  if (!Number.isFinite(factor) || factor <= 0) return safeRange
  const fraction = Math.min(1, Math.max(0, centerFraction))
  const currentSpan = safeRange.end - safeRange.start
  const nextSpan = Math.min(
    Math.max(currentSpan * factor, MIN_VIEWPORT_SPAN),
    MAX_VIEWPORT_SPAN
  )
  const anchor = safeRange.start + currentSpan * fraction
  return {
    start: anchor - nextSpan * fraction,
    end: anchor + nextSpan * (1 - fraction),
  }
}

export function panViewportRange(range: ViewportRange, deltaFraction: number): ViewportRange {
  const safeRange = normalizeViewportRange(range)
  if (!Number.isFinite(deltaFraction)) return safeRange
  const span = safeRange.end - safeRange.start
  const delta = span * deltaFraction
  return { start: safeRange.start + delta, end: safeRange.end + delta }
}

/**
 * Center a node in the viewport without changing the user's zoom unless a
 * long-running node needs more room to fit. Automatic focus never zooms in.
 */
export function focusViewportRange(
  range: ViewportRange,
  targetStart: number,
  targetEnd = targetStart
): ViewportRange {
  const safeRange = normalizeViewportRange(range)
  if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd)) return safeRange

  const start = Math.min(targetStart, targetEnd)
  const end = Math.max(targetStart, targetEnd)
  const currentSpan = safeRange.end - safeRange.start
  const targetSpan = end - start
  const nextSpan = Math.max(currentSpan, targetSpan * 1.4, MIN_VIEWPORT_SPAN)
  const center = start + targetSpan / 2
  return { start: center - nextSpan / 2, end: center + nextSpan / 2 }
}

/** Keep a viewport inside the navigable content range, including its allowed blank padding. */
export function clampViewportRange(
  range: ViewportRange,
  bounds: ViewportRange
): ViewportRange {
  const safeBounds = normalizeViewportRange(bounds)
  const safeRange = normalizeViewportRange(range, safeBounds)
  const boundsSpan = safeBounds.end - safeBounds.start
  const rangeSpan = safeRange.end - safeRange.start

  // A viewport wider than the navigable area cannot satisfy both edges, so
  // use the full allowed range instead of exposing unbounded empty space.
  if (rangeSpan >= boundsSpan) return safeBounds
  if (safeRange.start < safeBounds.start) {
    return { start: safeBounds.start, end: safeBounds.start + rangeSpan }
  }
  if (safeRange.end > safeBounds.end) {
    return { start: safeBounds.end - rangeSpan, end: safeBounds.end }
  }
  return safeRange
}

/** Clamp a pixel offset so canvas content cannot be panned completely out of view. */
export function clampCanvasOffset(
  offset: number,
  viewportSize: number,
  contentSize: number,
  padding = 48
): number {
  if (
    !Number.isFinite(offset) ||
    !Number.isFinite(viewportSize) ||
    !Number.isFinite(contentSize) ||
    viewportSize <= 0 ||
    contentSize <= 0
  ) {
    return Number.isFinite(offset) ? offset : 0
  }

  const safePadding = Math.max(0, Math.min(padding, viewportSize / 2))
  const farEdgeOffset = viewportSize - contentSize - safePadding
  const minOffset = Math.min(safePadding, farEdgeOffset)
  const maxOffset = Math.max(safePadding, farEdgeOffset)
  return Math.min(maxOffset, Math.max(minOffset, offset))
}
