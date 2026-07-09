const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]

export function chooseTickStep(span: number, targetTicks = 6): number {
  const raw = span / targetTicks
  for (const step of NICE_STEPS) {
    if (step >= raw) return step
  }
  return NICE_STEPS[NICE_STEPS.length - 1]
}

export function generateTicks(start: number, end: number, targetTicks = 6): number[] {
  const step = chooseTickStep(end - start, targetTicks)
  const first = Math.ceil(start / step) * step
  const ticks: number[] = []
  for (let t = first; t <= end; t += step) {
    ticks.push(Math.round(t))
  }
  return ticks
}
