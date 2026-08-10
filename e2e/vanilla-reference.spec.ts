import { test, expect } from '@playwright/test'
import {
  REDUCED_MOTION_TRANSITION_MS,
  SHEET_EASING,
  SHEET_TRANSITION_MS,
} from '../systems/vanilla/src/thumbzone.js'
import { maxTransitionDurationMs, transitionDurationMsFor, transitionEasing } from './support/motion'
import { openSheetAndSettle } from './support/sheet'

// Project-level, and deliberately not parameterised: these are the exact
// values of the *reference* implementation, not requirements on a port. The
// conformance suite holds every system to the semantics — motion within
// perceptible bounds on a non-linear curve, surfaces that do or do not hand a
// vertical pan to the browser, reduced motion collapsing to effectively
// instant. What that leaves unpinned is the reference point itself: vanilla is
// normative, its numbers are the ones the documentation quotes, and drift in
// them is a change to the contract rather than a port's own choice.
//
// This route is named directly rather than looked up in the registry, because
// the subject here is one specific implementation. registry.spec.ts asserts
// that this system is still the registered normative one.
const VANILLA_ROUTE = '/demo/vanilla'

test.describe('vanilla reference values', () => {
  test('the sheet transition is exactly the documented duration and easing', async ({ page }) => {
    await page.goto(VANILLA_ROUTE)
    const sheet = page.locator('[data-tz-sheet]')

    expect(await transitionDurationMsFor(sheet, 'transform')).toBe(SHEET_TRANSITION_MS)
    // Compared whitespace-insensitively (see transitionEasing): each engine
    // re-serialises the cubic-bezier arguments with its own spacing.
    expect(await transitionEasing(sheet)).toBe(SHEET_EASING.replace(/\s+/g, ''))
  })

  test('reduced motion collapses the sheet transition to exactly 1ms', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(VANILLA_ROUTE)
    // Guards the emulation itself, as elsewhere: without this the assertion
    // below would fail confusingly rather than pointing at the cause.
    expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

    expect(await maxTransitionDurationMs(page.locator('[data-tz-sheet]'))).toBe(REDUCED_MOTION_TRANSITION_MS)
  })

  // pinch-zoom rather than none, everywhere panning has to stay ours: a finger
  // that starts a pinch on the handle or the scrim must still zoom the page
  // (WCAG 1.4.4). The conformance suite only requires that these surfaces
  // refuse a vertical pan — which `none` also satisfies — so this is the one
  // place the accessible choice among the blocking values is pinned.
  test('touch-action keeps pinch-zoom available on every surface that blocks panning', async ({ page }) => {
    await page.goto(VANILLA_ROUTE)
    await openSheetAndSettle(page)

    const computedTouchAction = (selector: string) =>
      page.locator(selector).evaluate((el) => getComputedStyle(el).touchAction)

    expect(await computedTouchAction('[data-tz-handle]')).toBe('pinch-zoom')
    expect(await computedTouchAction('[data-tz-scrim]')).toBe('pinch-zoom')
    expect(await computedTouchAction('[data-tz-sheet]')).toBe('pinch-zoom')
    expect(await computedTouchAction('[data-tz-trigger]')).toBe('pinch-zoom')
    // The one surface that must stay pannable keeps pinch-zoom alongside it.
    expect(await computedTouchAction('[data-tz-menu]')).toBe('pan-y pinch-zoom')
  })
})
