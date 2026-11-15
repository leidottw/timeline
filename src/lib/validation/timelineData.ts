import type { LinkType, Storyline, TimelineData, TimelineNode } from '../../types'
import { getNodeSpan } from '../date/historicalDate.ts'

const LINK_TYPES = new Set<LinkType>(['youtube', 'wiki', 'generic'])

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertOptionalStringArray(value: unknown, path: string): asserts value is string[] | undefined {
  if (value === undefined) return
  assert(Array.isArray(value), `${path} 必須是陣列`)
  assert(value.every((item) => typeof item === 'string' && item.trim()), `${path} 只能包含非空白文字`)
}

function assertHttpUrl(value: string, path: string) {
  try {
    const url = new URL(value)
    assert(url.protocol === 'http:' || url.protocol === 'https:', `${path} 僅支援 HTTP(S)`)
  } catch (error) {
    if (error instanceof Error && error.message.includes('僅支援')) throw error
    throw new Error(`${path} 格式錯誤`)
  }
}

function validateNode(value: unknown, path: string, ids: Set<string>): asserts value is TimelineNode {
  assert(value !== null && typeof value === 'object', `${path} 必須是物件`)
  const node = value as Record<string, unknown>
  assert(typeof node.id === 'string' && node.id.trim(), `${path}.id 不可空白`)
  assert(!ids.has(node.id), `ID「${node.id}」重複`)
  ids.add(node.id)
  assert(typeof node.title === 'string' && node.title.trim(), `${path}.title 不可空白`)

  const hasTime = typeof node.time === 'string' && node.time.trim().length > 0
  const hasRange = node.timeRange !== undefined
  assert(hasTime !== hasRange, `${path} 必須且只能設定 time 或 timeRange`)
  if (hasRange) {
    assert(node.timeRange !== null && typeof node.timeRange === 'object', `${path}.timeRange 必須是物件`)
    const range = node.timeRange as Record<string, unknown>
    assert(typeof range.start === 'string' && range.start.trim(), `${path}.timeRange.start 不可空白`)
    assert(typeof range.end === 'string' && range.end.trim(), `${path}.timeRange.end 不可空白`)
  }

  try {
    getNodeSpan(node as unknown as TimelineNode)
  } catch (error) {
    const reason = error instanceof Error ? error.message : '日期格式錯誤'
    throw new Error(`${path} 的日期無效：${reason}`)
  }

  if (node.description !== undefined) assert(typeof node.description === 'string', `${path}.description 必須是文字`)
  if (node.nodeType !== undefined) assert(typeof node.nodeType === 'string', `${path}.nodeType 必須是文字`)
  assertOptionalStringArray(node.tags, `${path}.tags`)
  assertOptionalStringArray(node.images, `${path}.images`)
  node.images?.forEach((image, index) => assertHttpUrl(image, `${path}.images[${index}]`))

  if (node.links !== undefined) {
    assert(Array.isArray(node.links), `${path}.links 必須是陣列`)
    node.links.forEach((rawLink, index) => {
      const linkPath = `${path}.links[${index}]`
      assert(rawLink !== null && typeof rawLink === 'object', `${linkPath} 必須是物件`)
      const link = rawLink as Record<string, unknown>
      assert(typeof link.url === 'string' && link.url.trim(), `${linkPath}.url 不可空白`)
      assertHttpUrl(link.url, `${linkPath}.url`)
      assert(typeof link.type === 'string' && LINK_TYPES.has(link.type as LinkType), `${linkPath}.type 不支援`)
      if (link.title !== undefined) assert(typeof link.title === 'string', `${linkPath}.title 必須是文字`)
    })
  }
}

function validateStoryline(value: unknown, index: number, ids: Set<string>): asserts value is Storyline {
  const path = `storylines[${index}]`
  assert(value !== null && typeof value === 'object', `${path} 必須是物件`)
  const storyline = value as Record<string, unknown>
  assert(typeof storyline.id === 'string' && storyline.id.trim(), `${path}.id 不可空白`)
  assert(!ids.has(storyline.id), `ID「${storyline.id}」重複`)
  ids.add(storyline.id)
  assert(typeof storyline.name === 'string' && storyline.name.trim(), `${path}.name 不可空白`)
  assert(typeof storyline.color === 'string' && /^#[0-9a-f]{6}$/i.test(storyline.color), `${path}.color 必須是六位數色碼`)
  assert(storyline.position === 'above' || storyline.position === 'below', `${path}.position 不支援`)
  assert(typeof storyline.order === 'number' && Number.isFinite(storyline.order), `${path}.order 必須是數字`)
  if (storyline.description !== undefined) assert(typeof storyline.description === 'string', `${path}.description 必須是文字`)
  assert(Array.isArray(storyline.nodes), `${path}.nodes 必須是陣列`)
  storyline.nodes.forEach((node, nodeIndex) => validateNode(node, `${path}.nodes[${nodeIndex}]`, ids))
}

/** Validate unknown JSON before it reaches the store or layout engine. */
export function parseTimelineData(value: unknown): TimelineData {
  assert(value !== null && typeof value === 'object', '最外層必須是物件')
  const data = value as Record<string, unknown>
  assert(data.schemaVersion === undefined || data.schemaVersion === 1, '不支援的 schemaVersion')
  assert(Array.isArray(data.storylines), 'storylines 必須是陣列')
  const ids = new Set<string>()
  data.storylines.forEach((storyline, index) => validateStoryline(storyline, index, ids))
  return value as TimelineData
}
