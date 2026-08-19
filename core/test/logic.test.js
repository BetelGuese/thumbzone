import { describe, it, expect } from 'vitest'
import {
  APP_BAR_ICON_CENTRE,
  CORNER_REACH_DISTANCE,
  DISMISS_RATIO,
  FLING_VELOCITY,
  MAX_TRIGGER_BOTTOM_GAP,
  REFERENCE_VIEWPORT,
  SCROLL_THRESHOLD,
  VELOCITY_WINDOW_MS,
  dragProgress,
  shouldDismiss,
  createScrollDirectionTracker,
  createVelocityTracker,
} from '../index.js'

const rand = (min, max) => min + Math.random() * (max - min)
const randHeight = () => rand(320, 900)

// The complete set IEEE 754 actually calls non-finite — there is no
// continuous range to draw a "random" value from the way randHeight() does,
// so randomness here is which of the three this draw lands on rather than
// where in a range it falls.
const NON_FINITE_VALUES = [NaN, Infinity, -Infinity]
const randNonFinite = () => NON_FINITE_VALUES[Math.floor(Math.random() * NON_FINITE_VALUES.length)]

// The reach figure is the only number in this project a reader meets before any
// code, which makes it the one most worth holding to its own arithmetic.
describe('CORNER_REACH_DISTANCE', () => {
  it('is the separation between the trigger the pattern places and the one it replaces', () => {
    // Recomputed from the two endpoints rather than compared against a second
    // copy of the same figure: a test restating the constant it checks proves
    // only that the file parsed.
    const trigger = { x: REFERENCE_VIEWPORT.width / 2, y: REFERENCE_VIEWPORT.height }
    const measured = Math.hypot(
      trigger.x - APP_BAR_ICON_CENTRE.x,
      trigger.y - APP_BAR_ICON_CENTRE.y,
    )
    expect(Math.round(measured)).toBe(CORNER_REACH_DISTANCE)
  })

  it('dwarfs the bound the pattern holds its own trigger to', () => {
    // Compares two of this project's own figures rather than importing an
    // anthropometric one, which would put an unsourced number back into the
    // claim this test exists to keep sourced. Whatever a thumb's real sweep
    // is, a trigger within MAX_TRIGGER_BOTTOM_GAP of the bottom edge and one
    // a full CORNER_REACH_DISTANCE away are not the same ask. Without this,
    // a figure edited to something arithmetically tidy but far too small to
    // argue anything would still satisfy the check above.
    expect(CORNER_REACH_DISTANCE).toBeGreaterThan(MAX_TRIGGER_BOTTOM_GAP * 5)
  })
})

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

  // Zero itself, not drawn from a range. "Non-positive" is a boundary, and the
  // randomised range above reaches its endpoint with vanishing probability, so
  // a rule loosened from "height <= 0" to "height < 0" would survive it — the
  // one input that distinguishes them has to be stated. A collapsed sheet is
  // also the realistic case: a height read before layout is 0, not negative,
  // and 0 is what turns the progress calculation into a division by zero.
  it('rejects a zero height at the boundary itself', () => {
    expect(() => dragProgress(rand(0, 100), 0)).toThrow(/sheet height must be positive/)
  })

  // offset carries a sign (an upward drag is negative, clamped to 0 by the
  // Math.max below the guard) and height is already covered above, so this is
  // the one argument that was previously let through unchecked: a NaN or
  // Infinity here divides out to a NaN or Infinity progress instead of a
  // clear failure naming which argument was bad.
  it('rejects a non-finite offset with an actionable message naming it', () => {
    const height = randHeight()
    const offset = randNonFinite()
    expect(() => dragProgress(offset, height)).toThrow(/offset must be a finite number/)
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

  // The same boundary, and the same reason: the negated range above reaches it
  // only with the same vanishing probability, and only ever as a negative
  // zero, so the loosened rule survives it just as easily.
  it('rejects a zero height at the boundary itself', () => {
    expect(() => shouldDismiss({ offset: rand(0, 100), velocity: 0, height: 0 })).toThrow(
      /sheet height must be positive/,
    )
  })

  // offset and velocity were previously unchecked here too — a NaN offset
  // would fail the "offset <= 0" guard silently (NaN <= 0 is false) and fall
  // straight through to a comparison against DISMISS_RATIO that is also
  // always false, so the gesture would spring back regardless of how it was
  // actually released, with nothing pointing at why.
  it('rejects a non-finite offset with an actionable message naming it', () => {
    const height = randHeight()
    const velocity = rand(-FLING_VELOCITY, FLING_VELOCITY)
    const offset = randNonFinite()
    expect(() => shouldDismiss({ offset, velocity, height })).toThrow(/offset must be a finite number/)
  })

  // Likewise for velocity: a non-finite reading would compare against
  // FLING_VELOCITY and (for NaN) always lose, or (for Infinity) always win —
  // either way silently, rather than surfacing the bad input.
  it('rejects a non-finite velocity with an actionable message naming it', () => {
    const height = randHeight()
    const offset = rand(0, height)
    const velocity = randNonFinite()
    expect(() => shouldDismiss({ offset, velocity, height })).toThrow(/velocity must be a finite number/)
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

  it('drops samples older than the window so a stale, distant sample cannot dominate a later reading', () => {
    const tracker = createVelocityTracker()
    // The oldest sample sits far from where the drag ends up — velocityAt
    // only ever reads samples[0], so this is deliberately the *one* sample
    // that would anchor the whole calculation if pruning did not run.
    // -800 is chosen so that even the tightest combination of the random
    // draws below (release position and gap both as small as they can be)
    // still divides out to comfortably more than FLING_VELOCITY if this
    // sample is used as the anchor: worst case is roughly
    // (800 - 100) / (VELOCITY_WINDOW_MS * 3 + VELOCITY_WINDOW_MS - 1) ≈ 2.2.
    tracker.record(-800, 0)
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

  // The test above has only one stale sample to prune, so a mutated pruning
  // loop that removes at most one sample per record() call (`while` changed
  // to `if`) drains it in the same single call and passes regardless —
  // `samples[0]` is not read again until the next record() or velocityAt(),
  // and there is only one record() call after the pause in that test. A
  // cluster of *several* stale samples, still only ever visited by a single
  // record() call afterward (matching gestures.js's own real usage — see
  // the note above), needs every one of them pruned in that one call for
  // the anchor to land on real, recent movement. A single-shift mutation
  // would otherwise leave the anchor on one of these ancient, arbitrary
  // positions, and — since the direction of the resulting error depends on
  // how far that stale position happens to sit from the release point —
  // could just as easily suppress a genuine fling as fabricate one.
  it('drains an entire cluster of stale samples in one pass, not just the oldest', () => {
    const tracker = createVelocityTracker()
    // Several samples close together in time, near the start — recorded
    // during, say, an initial slow adjustment before the pause below.
    tracker.record(-800, 0)
    tracker.record(-800, 1)
    tracker.record(-800, 2)
    // A long pause, then exactly one record() call once movement resumes —
    // pruning has only this one call to drain the entire stale cluster
    // above before velocityAt() reads samples[0].
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
