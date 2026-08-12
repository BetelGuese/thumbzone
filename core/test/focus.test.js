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
    const length = randLength()
    // Anywhere but the last, where the wrap takes over instead.
    const currentIndex = Math.floor(rand(0, length - 1))
    expect(nextFocusIndex(currentIndex, length, false)).toBe(currentIndex + 1)
  })

  it('steps backward through the sequence', () => {
    const length = randLength()
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
  // menu. Feeding -1 into the wrap arithmetic instead would land a forward Tab
  // one element short and a backward one two, so this branch is stated rather
  // than derived.
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
