import type { TagMode, TimelineNode } from '../../types'

export function nodeMatchesTags(
  node: TimelineNode,
  activeTags: string[],
  tagMode: TagMode
): boolean {
  if (activeTags.length === 0) return true
  const nodeTags = node.tags ?? []
  if (tagMode === 'and') {
    return activeTags.every((t) => nodeTags.includes(t))
  }
  return activeTags.some((t) => nodeTags.includes(t))
}
