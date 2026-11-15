export function chooseTickStep(span: number, targetTicks = 6): number {
  if (!Number.isFinite(span) || span <= 0 || targetTicks <= 0) return 1
  const raw = span / targetTicks
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return nice * magnitude
}

export function generateTicks(start: number, end: number, targetTicks = 6): number[] {
  const step = chooseTickStep(end - start, targetTicks)
  const first = Math.ceil(start / step) * step
  const count = Math.max(0, Math.min(100, Math.floor((end - first) / step + 1e-9) + 1))
  return Array.from({ length: count }, (_, index) =>
    Number((first + index * step).toPrecision(12))
  )
}
