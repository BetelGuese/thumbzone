/**
 * thumbzone — variant 1 (bottom trigger + bottom sheet), normative reference.
 * Zero dependencies, no build step. Every port must match this behaviour.
 */

/** Fraction of sheet height a drag must pass to dismiss. */
export const DISMISS_RATIO = 0.25

/** Downward velocity (px/ms) that dismisses regardless of distance. */
export const FLING_VELOCITY = 0.5

/** Scroll delta (px) below which the trigger ignores movement, to avoid jitter. */
export const SCROLL_THRESHOLD = 8

function assertPositiveHeight(height) {
  if (!Number.isFinite(height) || height <= 0) {
    throw new RangeError(`thumbzone: sheet height must be positive, received ${height}`)
  }
}

/**
 * Fraction of the sheet that has been dragged away, clamped to 0–1.
 * @param {number} offset Pixels dragged downward from rest.
 * @param {number} height Sheet height in pixels.
 * @returns {number}
 */
export function dragProgress(offset, height) {
  assertPositiveHeight(height)
  return Math.min(Math.max(offset / height, 0), 1)
}

/**
 * Whether a released drag should dismiss the sheet.
 * @param {{ offset: number, velocity: number, height: number }} gesture
 * @returns {boolean}
 */
export function shouldDismiss({ offset, velocity, height }) {
  assertPositiveHeight(height)
  if (offset <= 0) return false
  return offset >= height * DISMISS_RATIO || velocity >= FLING_VELOCITY
}

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
