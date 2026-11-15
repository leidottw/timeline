import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getNodeSpan, parseHistoricalDate } from '../src/lib/date/historicalDate.ts'
import { parseTimelineData } from '../src/lib/validation/timelineData.ts'
import { DEFAULT_DISPLAY_DENSITY, parseDisplayDensity } from '../src/lib/settings/displayDensity.ts'
import {
  MIN_VIEWPORT_SPAN,
  clampCanvasOffset,
  clampViewportRange,
  focusViewportRange,
  normalizeViewportRange,
  panViewportRange,
  zoomViewportRange,
} from '../src/lib/viewport/range.ts'
import { chooseTickStep, generateTicks } from '../src/lib/layout/ticks.ts'
import { formatTimelineTick } from '../src/lib/date/historicalDate.ts'

test('display density defaults to comfortable and restores only supported values', () => {
  assert.equal(DEFAULT_DISPLAY_DENSITY, 'comfortable')
  assert.equal(parseDisplayDensity('compact'), 'compact')
  assert.equal(parseDisplayDensity('comfortable'), 'comfortable')
  assert.equal(parseDisplayDensity('oversized'), undefined)
})

test('viewport helpers pan freely before applying content bounds and zoom around an anchor', () => {
  assert.deepEqual(panViewportRange({ start: 0, end: 100 }, -2), { start: -200, end: -100 })
  assert.deepEqual(zoomViewportRange({ start: 0, end: 100 }, 0.5, 0), { start: 0, end: 50 })
  assert.deepEqual(zoomViewportRange({ start: 0, end: 100 }, 0.5, 1), { start: 50, end: 100 })
})

test('viewport clamps panning and excessive zoom-out to padded content bounds', () => {
  const bounds = { start: -20, end: 120 }
  assert.deepEqual(clampViewportRange({ start: -50, end: 50 }, bounds), {
    start: -20,
    end: 80,
  })
  assert.deepEqual(clampViewportRange({ start: 80, end: 180 }, bounds), {
    start: 20,
    end: 120,
  })
  assert.deepEqual(clampViewportRange({ start: -100, end: 200 }, bounds), bounds)
})

test('node focus centers content without zooming in and fits long ranges', () => {
  assert.deepEqual(focusViewportRange({ start: 0, end: 100 }, 70), { start: 20, end: 120 })
  assert.deepEqual(focusViewportRange({ start: 0, end: 10 }, 20, 40), { start: 16, end: 44 })
})

test('canvas cross-axis offset keeps tall and short content within padded bounds', () => {
  assert.equal(clampCanvasOffset(200, 500, 800, 40), 40)
  assert.equal(clampCanvasOffset(-500, 500, 800, 40), -340)
  assert.equal(clampCanvasOffset(0, 500, 200, 40), 40)
  assert.equal(clampCanvasOffset(400, 500, 200, 40), 260)
})

test('viewport rejects invalid ranges and keeps a numeric zoom safety floor', () => {
  assert.deepEqual(
    normalizeViewportRange({ start: Number.NaN, end: 10 }, { start: -5, end: 5 }),
    { start: -5, end: 5 }
  )
  const zoomed = zoomViewportRange({ start: 0, end: 1 }, 0.000001)
  assert.ok(Math.abs(zoomed.end - zoomed.start - MIN_VIEWPORT_SPAN) < 1e-12)
})

test('ticks remain bounded at extreme zoom levels and gain calendar detail up close', () => {
  assert.equal(chooseTickStep(1_000_000_000), 200_000_000)
  assert.ok(generateTicks(-500_000_000, 500_000_000).length <= 100)
  assert.equal(formatTimelineTick(2024.5, 1), '西元 2024 年 7 月')
  assert.match(formatTimelineTick(2024.5, 0.1), /7 月 1 日/)
})

test('bundled timeline data satisfies the public schema', () => {
  const raw = readFileSync(new URL('../src/data/timeline-data.json', import.meta.url), 'utf8')
  const data = parseTimelineData(JSON.parse(raw))
  const nodes = data.storylines.flatMap((storyline) => storyline.nodes)
  assert.equal(nodes.length, 168)
  assert.equal(nodes.some((node) => Object.hasOwn(node, 'nodeType')), false)
  assert.ok(nodes.some((node) => node.tags?.includes('人物')))
})

test('legacy nodeType values migrate into tags without duplication', () => {
  const data = parseTimelineData({
    storylines: [{
      id: 'history',
      name: '歷史',
      color: '#2563eb',
      position: 'above',
      order: 1,
      nodes: [{ id: 'person', title: '人物', time: '2024', tags: ['人物'], nodeType: '人物' }],
    }],
  })
  const node = data.storylines[0].nodes[0]
  assert.deepEqual(node.tags, ['人物'])
  assert.equal(Object.hasOwn(node, 'nodeType'), false)
})

test('validates real calendar dates, including leap years', () => {
  assert.deepEqual(parseHistoricalDate('2000-02-29'), { year: 2000, month: 2, day: 29 })
  assert.throws(() => parseHistoricalDate('1900-02-29'), /Invalid day/)
  assert.throws(() => parseHistoricalDate('2024-13-01'), /Invalid month/)
})

test('requires exactly one time representation and an ordered range', () => {
  assert.throws(() => getNodeSpan({ time: '0200', timeRange: { start: '0190', end: '0210' } }), /both/)
  assert.throws(() => getNodeSpan({ timeRange: { start: '0210', end: '0190' } }), /must not be after/)
  assert.deepEqual(getNodeSpan({ time: '-0000' }), [0, 0])
})

test('accepts a valid timeline document', () => {
  const data = parseTimelineData({
    schemaVersion: 1,
    storylines: [{
      id: 'history',
      name: '歷史',
      color: '#2563eb',
      position: 'above',
      order: 1,
      nodes: [{ id: 'event', title: '事件', time: '2024-01-01' }],
    }],
  })
  assert.equal(data.storylines[0].nodes[0].title, '事件')
})

test('rejects ambiguous dates and duplicate ids', () => {
  assert.throws(() => parseTimelineData({
    storylines: [{
      id: 'duplicate',
      name: '歷史',
      color: '#2563eb',
      position: 'above',
      order: 1,
      nodes: [{ id: 'duplicate', title: '事件', time: '2024', timeRange: { start: '2024', end: '2025' } }],
    }],
  }), /重複|只能設定/)
})
