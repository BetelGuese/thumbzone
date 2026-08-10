import { describe, it, expect } from 'vitest'
import {
  DISMISS_RATIO,
  FLING_VELOCITY,
  SCROLL_THRESHOLD,
  VELOCITY_WINDOW_MS,
  dragProgress,
  shouldDismiss,
  createScrollDirectionTracker,
  createVelocityTracker,
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

describe('createVelocityTracker', () => {
  it('reports zero velocity before any sample is recorded', () => {
    const tracker = createVelocityTracker()
    expect(tracker.velocityAt(rand(-500, 500), rand(0, 5000))).toBe(0)
  })

  it('reports the average velocity across the recorded window', () => {
    const tracker = createVelocityTracker()
    const startTime = rand(0, 1000)
    const startPosition = rand(-500, 500)
    const speed = rand(-2, 2) // px/ms; sign covers both drag directions
    const duration = rand(1, VELOCITY_WINDOW_MS - 1) // stays inside one window
    tracker.record(startPosition, startTime)
    const endTime = startTime + duration
    const endPosition = startPosition + speed * duration
    tracker.record(endPosition, endTime)
    expect(tracker.velocityAt(endPosition, endTime)).toBeCloseTo(speed, 6)
  })

  // The headline regression this tracker exists to fix: a naive
  // last-sample-only reading would report the outlier delta between two
  // adjacent samples directly, even though the drag's overall speed across
  // the window stays comfortably under FLING_VELOCITY — the same physical
  // gesture would then dismiss or not depending on how tightly spaced the
  // event stream happened to be, not on how the user actually moved.
  //
  // Deliberately does not `record()` the release point itself, matching how
  // gestures.js actually drives this: pointermove calls `record()`, and
  // pointerup calls only `velocityAt()`, never a matching final `record()`.
  // Skipping that distinction here would let a naive "recompute on every
  // record() call, ignore velocityAt()'s own arguments" implementation
  // dodge the jitter by having a later record() call quietly overwrite it.
  it('is not thrown off by a single high-rate jitter sample inside a slower overall window', () => {
    const tracker = createVelocityTracker()
    const t0 = rand(0, 1000)
    tracker.record(0, t0)
    // A single jittery sample: ~1px in a fraction of a millisecond is an
    // instantaneous rate many times FLING_VELOCITY on its own, and — with no
    // record() call after it — the last one the tracker ever sees.
    tracker.record(1, t0 + 0.2)
    // The overall speed from the first sample through to release stays well
    // under FLING_VELOCITY; only the single jittery step above did not.
    const overallSpeed = FLING_VELOCITY * rand(0.1, 0.4)
    const releaseTime = t0 + VELOCITY_WINDOW_MS * 0.9
    const releasePosition = overallSpeed * (releaseTime - t0)
    expect(Math.abs(tracker.velocityAt(releasePosition, releaseTime))).toBeLessThan(FLING_VELOCITY)
  })

  it('drops samples older than the window so a stale, fast sample cannot dominate a later reading', () => {
    const tracker = createVelocityTracker()
    // An old, very fast sample, about to age out of the window entirely...
    tracker.record(0, 0)
    tracker.record(rand(500, 1000), 1)
    // ...followed, well after that sample has fallen outside
    // VELOCITY_WINDOW_MS, by slow movement that should be all that remains.
    // No record() call at the release point itself — see the note above.
    const recentStart = VELOCITY_WINDOW_MS * 3
    const recentPosition = rand(-100, 100)
    tracker.record(recentPosition, recentStart)
    const slowSpeed = FLING_VELOCITY * rand(0.1, 0.4)
    const releaseTime = recentStart + rand(10, VELOCITY_WINDOW_MS - 1)
    const releasePosition = recentPosition + slowSpeed * (releaseTime - recentStart)
    expect(Math.abs(tracker.velocityAt(releasePosition, releaseTime))).toBeLessThan(FLING_VELOCITY)
  })

  // The other regression this tracker exists to fix: a quick flick followed
  // by holding still before releasing must not still read as a fling — the
  // pointer generates no further move events while it rests, so decay has
  // to come from measuring against the actual release moment, not from
  // whatever was last recorded.
  it('decays toward zero when released long after the pointer stopped moving', () => {
    const tracker = createVelocityTracker()
    const moveTime = rand(0, 100)
    const movePosition = rand(-100, 100)
    const moveSpan = 40
    const fastSpeed = FLING_VELOCITY * rand(2, 5) // a real flick just before the pause
    tracker.record(movePosition - fastSpeed * moveSpan, moveTime - moveSpan)
    tracker.record(movePosition, moveTime)
    // A long idle gap with no further samples (a resting finger generates
    // none), then release back at (about) the same position. The multiplier
    // is chosen so the decayed reading clears the threshold below even at
    // the fastest draw of fastSpeed above (5x FLING_VELOCITY): worst case
    // is 5 * FLING_VELOCITY * moveSpan / (idleGap + moveSpan), which must
    // stay under 0.05 * FLING_VELOCITY.
    const idleGap = VELOCITY_WINDOW_MS * 60
    const releaseTime = moveTime + idleGap
    expect(Math.abs(tracker.velocityAt(movePosition, releaseTime))).toBeLessThan(FLING_VELOCITY * 0.05)
  })
})
