import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getNodeSpan, parseHistoricalDate } from '../src/lib/date/historicalDate.ts'
import { parseTimelineData } from '../src/lib/validation/timelineData.ts'

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
