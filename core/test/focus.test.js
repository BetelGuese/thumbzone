import { describe, it, expect } from 'vitest'
import { nextFocusIndex } from '../index.js'

const rand = (min, max) => min + Math.random() * (max - min)
// Two or more, because the wrap is unobservable on a list of one — which is
// also why the conformance suite requires a port to author more than one menu
// item.
const randLength = () => Math.floor(rand(2, 12))
const randIndexWithin = (length) => Math.floor(rand(0, length))

describe('nextFocusIndex', () => {
  it('steps forward through the sequence', () => {
    // At least 3, not the usual 2-11: a ±1 step mod 2 can't tell a forward
    // step from a backward one, which would let a sign inversion in the
    // ternary below slip past this test undetected.
    const length = Math.floor(rand(3, 12))
    // Anywhere but the last, where the wrap takes over instead.
    const currentIndex = Math.floor(rand(0, length - 1))
    expect(nextFocusIndex(currentIndex, length, false)).toBe(currentIndex + 1)
  })

  it('steps backward through the sequence', () => {
    // At least 3, for the same reason as the forward step above.
    const length = Math.floor(rand(3, 12))
    // Anywhere but the first, for the same reason.
    const currentIndex = Math.floor(rand(1, length))
    expect(nextFocusIndex(currentIndex, length, true)).toBe(currentIndex - 1)
  })

  it('wraps forward from the last element to the first', () => {
    const length = randLength()
    expect(nextFocusIndex(length - 1, length, false)).toBe(0)
  })

  // The branch that makes the wrap arithmetic necessary at all: without the
  // modulo, a backward Tab from the first element lands on -1, which is not an
  // index of anything.
  it('wraps backward from the first element to the last', () => {
    const length = randLength()
    expect(nextFocusIndex(0, length, true)).toBe(length - 1)
  })

  // Focus sitting outside the sequence entirely — on the sheet's own
  // tabindex="-1" fallback, typically, right after it opened onto an empty
  // menu. Feeding -1 into the wrap arithmetic instead already gives the right
  // answer going forward (0), so the branch changes nothing there; going
  // backward it gives `length - 2`, one short of the last element, which is
  // the one direction this branch is load-bearing for. Stated rather than
  // derived because of that asymmetry.
  it('enters at the first element when focus is outside the sequence', () => {
    expect(nextFocusIndex(-1, randLength(), false)).toBe(0)
  })

  it('enters at the last element when focus is outside the sequence and Shift is held', () => {
    const length = randLength()
    expect(nextFocusIndex(-1, length, true)).toBe(length - 1)
  })

  it('always returns an index that exists in the sequence', () => {
    const length = randLength()
    const currentIndex = randIndexWithin(length)
    const backwards = Math.random() < 0.5
    const next = nextFocusIndex(currentIndex, length, backwards)
    expect(Number.isInteger(next)).toBe(true)
    expect(next).toBeGreaterThanOrEqual(0)
    expect(next).toBeLessThan(length)
  })
})
