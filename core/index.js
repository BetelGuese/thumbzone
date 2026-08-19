/**
 * The parts of the pattern that are the same in every design system: the drag
 * and dismiss maths, the velocity window, scroll-direction tracking, and the
 * values the conformance suite holds every port to.
 *
 * Nothing here touches the DOM, which is what lets it be unit-tested without a
 * browser and what keeps it separate from `behaviour.js`, `gestures.js` and
 * `scroll.js` — those share the ARIA lifecycle and the pointer handling, and
 * import these values rather than restating them. A port supplies its own
 * markup and styling using its own system's components, its framework binding
 * and hydration strategy, and drives the behaviour — which is why the gesture
 * *feel* is identical across systems without any port reimplementing the
 * arithmetic.
 *
 * The reference implementation's own exact motion values deliberately stay with
 * it rather than moving here: ports are held to the bounds in
 * `e2e/support/motion.ts`, not to vanilla's numbers, so that a port can use its
 * own design system's motion tokens and still look native.
 */

/** Fraction of sheet height a drag must pass to dismiss. */
export const DISMISS_RATIO = 0.25

/** Downward velocity (px/ms) that dismisses regardless of distance. */
export const FLING_VELOCITY = 0.5

// The constants below are implemented in thumbzone.css, which cannot import
// them. They are declared here so that the conformance suite has one named
// source for each value rather than a literal per assertion, and so that a
// stylesheet edit which drifts from the documented contract fails a test
// instead of passing quietly.

/** Minimum hit target (CSS px) for the trigger and the drag handle, in both axes. */
export const MIN_HIT_TARGET = 48

/**
 * Largest gap (CSS px) allowed between the trigger's bottom edge and the
 * viewport's bottom edge.
 *
 * The pattern's entire argument is that the trigger sits where the thumb
 * already rests, so "near the bottom" has to be a bounded claim: "below the
 * halfway line" would accept a trigger at 51% of the viewport height, which
 * is nowhere near a thumb on any phone. This ceiling is deliberately loose
 * enough that a port can reach the bottom edge through its own spacing scale
 * (the largest bottom inset a design system's tokens realistically produce is
 * around 3rem) stacked on top of a home-indicator safe-area inset (34px on
 * the tallest iPhones), while still being a small fraction of the shortest
 * viewport this pattern targets — so anything drifting toward the middle of
 * the screen fails it several times over.
 */
export const MAX_TRIGGER_BOTTOM_GAP = 96

/** Viewport width (CSS px) at and above which the pattern hides itself entirely. */
export const DESKTOP_BREAKPOINT = 768

/**
 * The viewport the reach claim is measured on: the 6.7" device this project's
 * own suite runs against, as `mobile-safari` in playwright.config.ts.
 *
 * Named here rather than written into the claim so the figure is quoted
 * against the phone the pattern is actually tested on, and not one picked
 * because it flattered the number.
 */
export const REFERENCE_VIEWPORT = Object.freeze({ width: 430, height: 932 })

/**
 * Centre (CSS px) of the navigation icon in a stock top app bar: a 48px hit
 * target inset by a 16px edge margin, on a 56px toolbar. Every design system
 * ported here puts the trigger at this point by default, and it is the point
 * the pattern moves away from.
 */
export const APP_BAR_ICON_CENTRE = Object.freeze({ x: 40, y: 28 })

/**
 * Straight-line distance (CSS px) from the trigger this pattern places to the
 * one it replaces, on REFERENCE_VIEWPORT.
 *
 * The thumb-zone trigger sits horizontally centred on the bottom edge, at
 * (215, 932). The app bar's sits at APP_BAR_ICON_CENTRE. Their separation is
 * hypot(215 - 40, 932 - 28) = 920.8.
 *
 * At 0.1656mm per CSS px on that display, 921px is 152mm — on a display
 * measuring 154mm from top to bottom. The reach is as long as the phone is
 * tall, which is why the corner needs a grip shift rather than a stretch.
 *
 * Declared here for the reason the constants above it are, and for one more:
 * this is the opening sentence of README.md and of the showcase's own hero.
 * A figure carrying that much of the argument, and living only in prose, is a
 * figure no test can fail. The unit test recomputes it from the two endpoints
 * rather than restating it, so moving either one without moving this reddens
 * instead of quietly publishing a number that is no longer true.
 */
export const CORNER_REACH_DISTANCE = 921

function assertPositiveHeight(height) {
  if (!Number.isFinite(height) || height <= 0) {
    throw new RangeError(`thumbzone: sheet height must be positive, received ${height}`)
  }
}

// offset and velocity carry a sign (a drag can run either direction, and a
// release can be measured mid-flick or long after the finger stopped), so
// unlike height there is no positive/negative split to reject — only
// non-finite is ever wrong. Both callers (every port's gestures module) build
// these from real pointer coordinates and a velocity tracker that already
// guards its own division, so neither should ever produce one in normal
// operation; this exists for the same reason height's own guard does — a
// public function with no author in sight should not let a NaN or an
// Infinity silently propagate into the maths and come out the other side as
// a wrong-but-plausible-looking number instead of a clear failure naming
// which argument was bad.
function assertFiniteNumber(value, name) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`thumbzone: ${name} must be a finite number, received ${value}`)
  }
}

/**
 * Fraction of the sheet that has been dragged away, clamped to 0–1.
 * @param {number} offset Pixels dragged downward from rest.
 * @param {number} height Sheet height in pixels.
 * @returns {number}
 * @throws {RangeError} If offset is not a finite number, or height is not a positive finite number.
 */
export function dragProgress(offset, height) {
  // Checked in parameter order, not by priority: this is not a deliberate
  // choice about which message should win when both arguments are invalid at
  // once, so reordering these two lines loses nothing worth preserving.
  assertFiniteNumber(offset, 'offset')
  assertPositiveHeight(height)
  return Math.min(Math.max(offset / height, 0), 1)
}

/**
 * Whether a released drag should dismiss the sheet.
 * @param {{ offset: number, velocity: number, height: number }} gesture
 * @returns {boolean}
 * @throws {RangeError} If offset or velocity is not a finite number, or height is not a positive finite number.
 */
export function shouldDismiss({ offset, velocity, height }) {
  // Same non-priority ordering as dragProgress above — matches the
  // destructured parameter order above, not a ranking of which invalid
  // argument's message should surface first when more than one is bad.
  assertFiniteNumber(offset, 'offset')
  assertFiniteNumber(velocity, 'velocity')
  assertPositiveHeight(height)
  if (offset <= 0) return false
  return offset >= height * DISMISS_RATIO || velocity >= FLING_VELOCITY
}

/** Time window (ms) a drag's velocity is averaged over, to smooth event-to-event jitter. */
export const VELOCITY_WINDOW_MS = 80

/**
 * Tracks a drag's vertical velocity from a stream of (position, time)
 * samples, windowed rather than taken from the single most recent delta. A
 * last-sample-only reading is extremely sensitive to cadence: at a high
 * touch sampling rate, one pixel of jitter between adjacent events can
 * already read as a meaningful fraction of FLING_VELOCITY, so identical
 * gestures would dismiss or not depending on the hardware, not the user.
 * Averaging over VELOCITY_WINDOW_MS absorbs that noise while still
 * capturing a genuine flick, which happens well within that span.
 * @returns {{ record: (position: number, time: number) => void, velocityAt: (position: number, time: number) => number }}
 */
export function createVelocityTracker() {
  const samples = []

  return {
    record(position, time) {
      samples.push({ position, time })
      while (samples.length > 1 && time - samples[0].time > VELOCITY_WINDOW_MS) {
        samples.shift()
      }
    },
    // Takes the *release* position/time explicitly rather than reusing the
    // last recorded sample: a finger held still before lifting generates no
    // further move events, so measuring against the real release moment —
    // against however stale the window has become — decays velocity toward
    // zero for a deliberate pause, instead of dismissing on however fast
    // the user was moving before they stopped.
    velocityAt(position, time) {
      if (samples.length === 0) return 0
      const oldest = samples[0]
      const elapsed = time - oldest.time
      if (elapsed <= 0) return 0
      return (position - oldest.position) / elapsed
    },
  }
}

/** Shared with e2e tests so the "what counts as focusable" definition has one source of truth. */
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * The trigger's accessible name when a port's own markup authors none — see
 * `setOpen` in `core/behaviour.js`.
 * Exported, rather than left as a literal in each module, for the same
 * reason `FOCUSABLE` is: the reference and every port must write the
 * identical string, and the conformance suite has to assert against that
 * same value rather than a copy of its own. A copy left to drift out of step
 * with a wording change here would not just miss the change — it would make
 * the suite's "not the fallback" assertion pass for the wrong reason, since
 * it would then be comparing against a string that is no longer the
 * fallback a silent, unnamed port actually produces.
 */
export const FALLBACK_TRIGGER_LABEL_CLOSED = 'Open menu'

/** The open-state half of the pair above. */
export const FALLBACK_TRIGGER_LABEL_OPEN = 'Close menu'

/** Scroll delta (px) below which the trigger ignores movement, to avoid jitter. */
export const SCROLL_THRESHOLD = 8

/**
 * Tracks scroll direction, ignoring sub-threshold jitter.
 * Returns 'show' | 'hide' when the trigger should change state, or null when it should not.
 * The document start and end always force 'show' so the trigger can never be
 * stranded off-screen where the user has nowhere left to scroll.
 * @param {{ threshold?: number }} [options]
 */
export function createScrollDirectionTracker({ threshold = SCROLL_THRESHOLD } = {}) {
  let anchor = 0
  return function update(scrollY, maxScrollY) {
    if (scrollY <= 0 || scrollY >= maxScrollY) {
      anchor = scrollY
      return 'show'
    }
    const delta = scrollY - anchor
    if (Math.abs(delta) < threshold) return null
    anchor = scrollY
    return delta > 0 ? 'hide' : 'show'
  }
}

/**
 * Vertical travel (px) on the trigger that counts as a swipe rather than a tap.
 * Exported so the conformance suite paces its swipes either side of this
 * threshold instead of restating it — imported from here, like every other
 * shared value, rather than through any one system's own module.
 */
export const SWIPE_OPEN_DISTANCE = 24

/**
 * The index a Tab press moves focus to, within a cycle of `length` focusable
 * elements.
 *
 * Lives here, DOM-free, rather than inline in the trap that uses it, because
 * this arithmetic is where a hand-written focus trap goes wrong and it is the
 * one part of the trap a test can reach without a browser. The trap itself
 * cannot be unit-tested — it depends on `offsetParent`, which no DOM shim
 * computes — so the cycle it walks is checked here and the walking is checked
 * by the conformance suite.
 *
 * @param {number} currentIndex The focused element's index, or -1 when focus
 *   sits outside the sequence — on the sheet's own `tabindex="-1"` fallback,
 *   say. Treated as "just before the sequence" rather than fed into the wrap
 *   arithmetic below. That matters in one direction only, which is worth
 *   stating precisely because it is easy to assume otherwise: a forward Tab
 *   from -1 comes out of the wrap as 0 regardless, so the branch changes
 *   nothing there; a backward one comes out as `length - 2`, one short of the
 *   last element, which is the case this exists for.
 * @param {number} length How many focusable elements there are. Positive.
 * @param {boolean} backwards Whether Shift was held.
 * @returns {number}
 */
export function nextFocusIndex(currentIndex, length, backwards) {
  if (currentIndex === -1) return backwards ? length - 1 : 0
  return (currentIndex + (backwards ? -1 : 1) + length) % length
}
