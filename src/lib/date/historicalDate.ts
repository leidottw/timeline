/**
 * HistoricalDate utilities.
 *
 * Native JS `Date` cannot cleanly represent BCE years or coarse-grained
 * dates (year-only, year-month). We use astronomical year numbering
 * (year 0 = 1 BCE, -1 = 2 BCE, ...) and parse strings of the form:
 *   "1949-10-01"   year-month-day, CE
 *   "1949-10"      year-month, CE
 *   "1949"         year only, CE
 *   "-0208-07-01"  year-month-day, BCE (astronomical year -208)
 *
 * All dates are converted to a single sortable float (fractional year)
 * for positioning on the timeline and for comparisons.
 */

export interface ParsedDate {
  year: number
  month?: number
  day?: number
}

const DATE_RE = /^(-?\d{1,6})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/

export function parseHistoricalDate(input: string): ParsedDate {
  const trimmed = input.trim()
  const match = DATE_RE.exec(trimmed)
  if (!match) {
    throw new Error(`Invalid historical date: "${input}"`)
  }
  const [, yearStr, monthStr, dayStr] = match
  return {
    year: parseInt(yearStr, 10),
    month: monthStr ? parseInt(monthStr, 10) : undefined,
    day: dayStr ? parseInt(dayStr, 10) : undefined,
  }
}

/** Convert a parsed date to a sortable fractional-year number. */
export function toFractionalYear(parsed: ParsedDate): number {
  const month = parsed.month ?? 1
  const day = parsed.day ?? 1
  const monthFrac = (month - 1) / 12
  const dayFrac = (day - 1) / 12 / 30
  return parsed.year + monthFrac + dayFrac
}

export function dateStringToNumber(input: string): number {
  return toFractionalYear(parseHistoricalDate(input))
}

/** Format a fractional year back into a human label, e.g. "西元前 208 年" / "西元 1949 年". */
export function formatYearLabel(year: number): string {
  const rounded = Math.round(year)
  if (rounded <= 0) {
    return `西元前 ${1 - rounded} 年`
  }
  return `西元 ${rounded} 年`
}

export function formatHistoricalDate(input: string): string {
  const parsed = parseHistoricalDate(input)
  const yearLabel = formatYearLabel(parsed.year)
  if (parsed.month && parsed.day) {
    return `${yearLabel} ${parsed.month} 月 ${parsed.day} 日`
  }
  if (parsed.month) {
    return `${yearLabel} ${parsed.month} 月`
  }
  return yearLabel
}

export function compareHistoricalDates(a: string, b: string): number {
  return dateStringToNumber(a) - dateStringToNumber(b)
}

/** Get the numeric [start, end] span for a node's time or timeRange. */
export function getNodeSpan(node: {
  time?: string
  timeRange?: { start: string; end: string }
}): [number, number] {
  if (node.timeRange) {
    return [
      dateStringToNumber(node.timeRange.start),
      dateStringToNumber(node.timeRange.end),
    ]
  }
  if (node.time) {
    const n = dateStringToNumber(node.time)
    return [n, n]
  }
  throw new Error('Node has neither time nor timeRange')
}
