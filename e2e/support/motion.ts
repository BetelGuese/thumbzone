import { type Locator } from '@playwright/test'

/**
 * Upper bound (ms) for a transition that has to read as instant.
 *
 * The reduced-motion contract is "the sheet does not travel", not "the
 * duration is exactly one millisecond": a port whose motion tokens collapse
 * to 0s, or to a value under a single 60Hz frame, honours the preference just
 * as well. One frame (~16.7ms) rounded up is the point past which motion
 * becomes something a user can actually perceive as movement.
 */
export const INSTANT_MOTION_MAX_MS = 20

/**
 * Bounds (ms) for the sheet's open/close transition.
 *
 * Deliberately a range, not the reference implementation's exact 240ms:
 * requiring every design system to abandon its own motion tokens would
 * contradict the goal that a port look native to the system it belongs to.
 * The bounds are what the pattern needs to stay legible, not a survey of
 * every design system's motion tokens: below the floor the sheet appears
 * already-arrived, so it stops communicating that the menu came up from the
 * trigger the thumb just touched — the whole point of the pattern. Above the
 * ceiling the user is waiting on the interface: a menu is a means to
 * something else. 400ms is this pattern's own ceiling regardless of what a
 * system's own tokens allow elsewhere — it is not a claim that every
 * platform's "large" or "expressive" motion sits under it (Material 3's
 * long/expressive tokens, for instance, run 500–600ms, well past it), so a
 * port is expected to reach for one of its own *faster* tokens here rather
 * than its slowest one.
 */
export const SHEET_MOTION_MIN_MS = 120
export const SHEET_MOTION_MAX_MS = 400

/** Splits a computed CSS list value on top-level commas only, so `cubic-bezier(0, 0, 1, 1)` survives intact. */
function splitComputedList(value: string): string[] {
  return value
    .split(/,(?![^(]*\))/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
}

/** Parses one computed CSS `<time>` into milliseconds. `ms` is checked first, since `0.24s` also ends in `s`. */
function parseTimeMs(value: string): number {
  return value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000
}

/** Every duration in a computed `transition-duration`, in milliseconds. */
export function parseDurationsMs(computed: string): number[] {
  return splitComputedList(computed).map(parseTimeMs)
}

/**
 * Whether every function in a computed `transition-timing-function` is
 * non-linear — i.e. the motion accelerates or decelerates rather than moving
 * at a constant rate, which is what makes a sheet feel like it has weight.
 *
 * Known limit: a `cubic-bezier` whose control points happen to describe a
 * straight line reads as non-linear here. Nothing plausible declares one.
 */
export function isNonLinearEasing(computed: string): boolean {
  const easings = splitComputedList(computed)
  if (easings.length === 0) return false
  return easings.every((easing) => easing !== 'linear' && !easing.startsWith('step'))
}

/** The longest transition duration declared on an element, in milliseconds. */
export async function maxTransitionDurationMs(locator: Locator): Promise<number> {
  const computed = await locator.evaluate((el) => getComputedStyle(el).transitionDuration)
  return Math.max(...parseDurationsMs(computed))
}

/**
 * The transition duration (ms) an element declares for one specific property,
 * or 0 when it declares none — which reads as "this property is not
 * transitioned", and is what a bounds assertion should then fail on.
 */
export async function transitionDurationMsFor(locator: Locator, property: string): Promise<number> {
  const { properties, durations } = await locator.evaluate((el) => {
    const style = getComputedStyle(el)
    return { properties: style.transitionProperty, durations: style.transitionDuration }
  })
  const declared = splitComputedList(properties)
  const parsed = parseDurationsMs(durations)
  const index = declared.indexOf(property.toLowerCase())
  const matched = index === -1 ? declared.indexOf('all') : index
  if (matched === -1) return 0
  // Shorter lists repeat, per the transition shorthand's own rules.
  return parsed[matched % parsed.length]
}

/** The computed transition timing function for an element, whitespace-normalised. */
export async function transitionEasing(locator: Locator): Promise<string> {
  const computed = await locator.evaluate((el) => getComputedStyle(el).transitionTimingFunction)
  // Engines re-serialise `cubic-bezier()` arguments with their own spacing, so
  // comparing against a declared value has to ignore whitespace entirely.
  return computed.replace(/\s+/g, '')
}
