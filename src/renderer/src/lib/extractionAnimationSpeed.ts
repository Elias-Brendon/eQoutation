const MIN_SPEED = 0.75
const MAX_SPEED = 1.4

/** Maps extraction progress (0-100) to a DotmSquare2 `speed` value, so the
 * animation visibly accelerates as extraction nears completion. */
export function pctToDotmSpeed(pct: number): number {
  const clamped = Math.min(100, Math.max(0, pct))
  return MIN_SPEED + (clamped / 100) * (MAX_SPEED - MIN_SPEED)
}
