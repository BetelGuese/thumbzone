import { describe, it, expect } from 'vitest'
import {
  DISMISS_RATIO,
  FLING_VELOCITY,
  SCROLL_THRESHOLD,
  dragProgress,
  shouldDismiss,
  createScrollDirectionTracker,
} from '../src/thumbzone.js'

const rand = (min, max) => min + Math.random() * (max - min)
const randHeight = () => rand(320, 900)

describe('dragProgress', () => {
  it('reports the fraction of the sheet height dragged', () => {
    const height = randHeight()
    const offset = rand(0, height)
    expect(dragProgress(offset, height)).toBeCloseTo(offset / height, 10)
  })

  it('clamps upward drags to 0', () => {
    const height = randHeight()
    expect(dragProgress(rand(-height, -1), height)).toBe(0)
  })

  it('clamps overdrags to 1', () => {
    const height = randHeight()
    expect(dragProgress(rand(height, height * 3), height)).toBe(1)
  })

  it('rejects a non-positive height with an actionable message', () => {
    expect(() => dragProgress(rand(0, 100), rand(-500, 0))).toThrow(/sheet height must be positive/)
  })
})

describe('shouldDismiss', () => {
  it('dismisses when the drag passes the threshold, whatever the velocity', () => {
    const height = randHeight()
    const offset = rand(height * DISMISS_RATIO, height)
    const velocity = rand(-FLING_VELOCITY, FLING_VELOCITY * 0.99)
    expect(shouldDismiss({ offset, velocity, height })).toBe(true)
  })

  it('dismisses a fast downward fling that never reached the threshold', () => {
    const height = randHeight()
    const offset = rand(0, height * DISMISS_RATIO * 0.99)
    const velocity = rand(FLING_VELOCITY, FLING_VELOCITY * 10)
    expect(shouldDismiss({ offset, velocity, height })).toBe(true)
  })

  it('springs back for a short, slow drag', () => {
    const height = randHeight()
    const offset = rand(0, height * DISMISS_RATIO * 0.99)
    const velocity = rand(-FLING_VELOCITY, FLING_VELOCITY * 0.99)
    expect(shouldDismiss({ offset, velocity, height })).toBe(false)
  })

  it('never dismisses on an upward drag', () => {
    const height = randHeight()
    expect(shouldDismiss({ offset: rand(-height, -1), velocity: rand(FLING_VELOCITY, FLING_VELOCITY * 10), height })).toBe(false)
  })

  it('rejects a non-positive height with an actionable message', () => {
    expect(() => shouldDismiss({ offset: rand(0, 100), velocity: 0, height: -rand(0, 500) })).toThrow(/sheet height must be positive/)
  })
})

describe('createScrollDirectionTracker', () => {
  it('hides on a downward scroll beyond the threshold', () => {
    const update = createScrollDirectionTracker()
    const start = rand(100, 500)
    update(start, Infinity)
    expect(update(start + rand(SCROLL_THRESHOLD, 200), Infinity)).toBe('hide')
  })

  it('shows on an upward scroll beyond the threshold', () => {
    const update = createScrollDirectionTracker()
    const start = rand(300, 800)
    update(start, Infinity)
    expect(update(start - rand(SCROLL_THRESHOLD, 200), Infinity)).toBe('show')
  })

  it('ignores jitter below the threshold', () => {
    const update = createScrollDirectionTracker()
    const start = rand(100, 500)
    update(start, Infinity)
    expect(update(start + rand(0, SCROLL_THRESHOLD), Infinity)).toBeNull()
  })

  it('always shows at the top of the document', () => {
    const update = createScrollDirectionTracker()
    update(rand(300, 800), Infinity)
    expect(update(0, Infinity)).toBe('show')
  })

  it('always shows at the end of the document', () => {
    const update = createScrollDirectionTracker()
    const max = rand(1000, 5000)
    update(rand(100, 500), max)
    expect(update(max, max)).toBe('show')
  })

  it('uses SCROLL_THRESHOLD as the default threshold', () => {
    const update = createScrollDirectionTracker()
    const start = rand(100, 500)
    update(start, Infinity)
    expect(update(start + SCROLL_THRESHOLD - 0.1, Infinity)).toBeNull()
    expect(update(start + SCROLL_THRESHOLD, Infinity)).toBe('hide')
  })

  it('accumulates sub-threshold deltas until crossing the threshold', () => {
    const update = createScrollDirectionTracker()
    const start = rand(100, 500)
    update(start, Infinity)
    const step = SCROLL_THRESHOLD * 0.4
    update(start + step, Infinity)
    expect(update(start + step * 3, Infinity)).toBe('hide')
  })
})
