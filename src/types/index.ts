export type LinkType = 'youtube' | 'wiki' | 'generic'

export interface NodeLink {
  url: string
  type: LinkType
  title?: string
}

export interface TimelineNode {
  id: string
  title: string
  /** ISO-ish date string, supports BCE via leading minus, e.g. "-0208-07" */
  time?: string
  timeRange?: { start: string; end: string }
  description?: string
  images?: string[]
  links?: NodeLink[]
  tags?: string[]
  nodeType?: string
}

export type StorylinePosition = 'above' | 'below'

export interface Storyline {
  id: string
  name: string
  color: string
  position: StorylinePosition
  order: number
  description?: string
  nodes: TimelineNode[]
}

export interface TimelineData {
  schemaVersion?: 1
  storylines: Storyline[]
}

export type Orientation = 'horizontal' | 'vertical'
export type TagMode = 'or' | 'and'

export interface ViewportRange {
  start: number
  end: number
}
