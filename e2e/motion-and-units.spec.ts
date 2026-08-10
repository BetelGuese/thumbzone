import { test, expect } from '@playwright/test'
import { readFileSync, statSync, globSync } from 'node:fs'
import {
  INSTANT_MOTION_MAX_MS,
  SHEET_MOTION_MAX_MS,
  SHEET_MOTION_MIN_MS,
  isNonLinearEasing,
  maxTransitionDurationMs,
  parseDurationsMs,
  transitionDurationMsFor,
  transitionEasing,
} from './support/motion'
import { describeForEachSystem } from './support/systems'
import { permitsVerticalPanning } from './support/touch'

// Assets a CSS length cannot hide in. Everything else under the two source
// roots is scanned, rather than an allowlist of extensions: a stylesheet, a
// logic module (a JS module can write an inline `100vh` just as easily as a
// stylesheet can), a component file, and an Astro page's own <style> block can
// each carry one. An allowlist would silently stop covering the first port
// that shipped a `.less`, `.styl` or `.astro` file inside its own directory —
// which is the same way a `systems/vanilla/src` root would have stopped
// covering the twelve systems still to come.
const BINARY_ASSETS = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|pdf|zip)$/i
const SCANNED_FILES = [...globSync('systems/*/src/**/*'), ...globSync('site/src/**/*')].filter(
  (file) => !BINARY_ASSETS.test(file) && statSync(file).isFile(),
)

// A digit run immediately followed by `vh`, word-bounded on both sides. The
// leading `\b\d+` is what keeps this from matching the "vh" inside "85dvh":
// every character of "85dvh" is a word character with no boundary among
// them, so `\d+` can only anchor at that token's start — where the next
// two characters are "dv", not "vh" — and the match fails. The same absence
// of an immediately preceding digit run is what keeps a bare mention of the
// unit in prose ("not vh:") from tripping this. Case-insensitive because CSS
// units are: a stray `100VH` is the same violation as `100vh`, and would
// otherwise sail straight through.
const BARE_VH = /\b\d+(\.\d+)?vh\b/i

// Project-level, not per-system: this pair scans the repository's own source
// files rather than anything a browser rendered, so running it once per
// registered system would repeat identical work and report identical results.
test.describe('vh guard', () => {
  test('the pattern tells a real violation apart from dvh and from prose', () => {
    expect(BARE_VH.test('max-block-size: 100dvh;')).toBe(false)
    expect(BARE_VH.test('overflows 85dvh on both target devices')).toBe(false)
    expect(BARE_VH.test('dvh, not vh: iOS Safari collapsing URL bar')).toBe(false)
    expect(BARE_VH.test('max-block-size: 100vh;')).toBe(true)
    // Case-insensitivity, both ways round: an upper-case violation is caught,
    // and an upper-case `dvh` is still not mistaken for one.
    expect(BARE_VH.test('max-block-size: 100VH;')).toBe(true)
    expect(BARE_VH.test('max-block-size: 100DVH;')).toBe(false)
  })

  test('no scanned file uses vh where dvh is required', () => {
    // Guards the guard twice over: an empty list would make the loop below
    // vacuously pass whatever any file contained, and a glob that resolved to
    // only the Astro pages would still be non-empty while covering no
    // implementation source at all. The normative system's stylesheet is the
    // one file guaranteed to exist, so its presence proves the systems glob
    // reaches real sources.
    expect(SCANNED_FILES.length).toBeGreaterThan(0)
    expect(SCANNED_FILES).toContain('systems/vanilla/src/thumbzone.css')
    for (const file of SCANNED_FILES) {
      const contents = readFileSync(file, 'utf8')
      expect(contents, `${file} uses vh where dvh is required`).not.toMatch(BARE_VH)
    }
  })
})

// Also project-level, and for the same reason the vh pattern is checked
// directly: the conformance specs now assert on the *meaning* of a computed
// value rather than its exact spelling, so a predicate that quietly answered
// the same way for everything would make those assertions unable to fail. The
// cases below are the ones a port could plausibly declare.
test.describe('contract predicates', () => {
  test('panning permission is read from the value, not merely from its presence', () => {
    // Blocking: the reference implementation's own choice, the blunter
    // alternative, and a horizontal-only grant.
    expect(permitsVerticalPanning('pinch-zoom')).toBe(false)
    expect(permitsVerticalPanning('none')).toBe(false)
    expect(permitsVerticalPanning('pan-x')).toBe(false)
    // Permissive: the default a missing declaration falls back to, the one
    // that only drops double-tap zoom, and explicit vertical grants.
    expect(permitsVerticalPanning('auto')).toBe(true)
    expect(permitsVerticalPanning('manipulation')).toBe(true)
    expect(permitsVerticalPanning('pan-y pinch-zoom')).toBe(true)
    expect(permitsVerticalPanning('pan-down')).toBe(true)
  })

  test('durations and easings are read across a multi-property transition', () => {
    // Both CSS time units, and a list — a port declaring `transform 240ms,
    // opacity 100ms` must not have only its first entry read.
    expect(parseDurationsMs('0.24s')).toEqual([240])
    expect(parseDurationsMs('240ms, 0.1s')).toEqual([240, 100])
    // The commas inside cubic-bezier() must not be mistaken for list
    // separators, or a single easing would parse as four unreadable ones.
    expect(isNonLinearEasing('cubic-bezier(0.32, 0.72, 0, 1)')).toBe(true)
    expect(isNonLinearEasing('ease-out')).toBe(true)
    expect(isNonLinearEasing('linear')).toBe(false)
    expect(isNonLinearEasing('steps(4, end)')).toBe(false)
    // Every entry has to qualify: one linear leg is still linear motion.
    expect(isNonLinearEasing('cubic-bezier(0.32, 0.72, 0, 1), linear')).toBe(false)
  })
})

// The sheet's motion is a stated global constraint, and until now nothing
// asserted it at all: a port could slide the sheet for 600ms at a constant
// rate and pass the entire suite.
//
// Bounded rather than exact, unlike the reference implementation's own numbers
// (pinned in vanilla-reference.spec.ts): a port should reach these through its
// own design system's motion tokens, which is the whole premise of porting the
// pattern rather than restyling one implementation.
describeForEachSystem('sheet motion', (system) => {
  test('slides the sheet within perceptible bounds, on a non-linear curve', async ({ page }) => {
    await page.goto(system.route)
    const sheet = page.locator('[data-tz-sheet]')

    // Read for `transform` specifically: that is the property the sheet
    // travels on, and a port transitioning only `opacity` for 240ms while
    // snapping its position would otherwise satisfy a bound taken over
    // whatever happened to be the longest.
    const duration = await transitionDurationMsFor(sheet, 'transform')
    expect(duration, 'the sheet must transition transform').toBeGreaterThanOrEqual(SHEET_MOTION_MIN_MS)
    expect(duration).toBeLessThanOrEqual(SHEET_MOTION_MAX_MS)

    const easing = await transitionEasing(sheet)
    expect(isNonLinearEasing(easing), `the sheet's motion must not be linear (${easing})`).toBe(true)
  })
})

// The drag-and-release halves of this preference are already covered where
// the drag itself lives (gestures.spec.ts) — direct manipulation is exempt
// from prefers-reduced-motion because the user, not the interface, is
// driving it. What's missing is the plainest case: opening the sheet from a
// tap on the trigger, with no drag involved at all.
describeForEachSystem('reduced motion', (system) => {
  test('opening via the trigger cross-fades in place, and never translates', async ({ page }) => {
    // test.use({ reducedMotion: 'reduce' }) does not reliably take effect
    // against this project's webServer-launched, device-emulated contexts
    // in this Playwright version — emulateMedia() called directly does, and
    // is verified below via matchMedia before relying on it for the rest of
    // the test. (Same finding as gestures.spec.ts.)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(system.route)
    expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

    const sheet = page.locator('[data-tz-sheet]')
    await expect(sheet).toHaveCSS('opacity', '0')
    // Under reduced motion the sheet is never actually translated
    // off-screen while closed — it stays at rest and only its opacity
    // changes — so its closed position already tells us where an open one
    // must end up too, if opening truly never translates it.
    const closedBox = (await sheet.boundingBox())!

    await page.locator('[data-tz-trigger]').click()
    await expect(sheet).toHaveAttribute('data-tz-open', 'true')
    await expect(sheet).toHaveCSS('opacity', '1')

    const openBox = (await sheet.boundingBox())!
    expect(openBox.y).toBeCloseTo(closedBox.y, 0)
    expect(openBox.height).toBeCloseTo(closedBox.height, 0)

    // The system's own reduced-motion rules must collapse every transition on
    // the sheet to effectively nothing, which is what makes the position check
    // above meaningful rather than a slide merely caught mid-flight. A bound,
    // not an exact duration: 0s honours the preference as well as 1ms does,
    // and a port is free to reach it through its own motion tokens.
    expect(await maxTransitionDurationMs(sheet)).toBeLessThanOrEqual(INSTANT_MOTION_MAX_MS)
  })
})
