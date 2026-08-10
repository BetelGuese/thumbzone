import { test, expect } from '@playwright/test'
import { readFileSync, globSync } from 'node:fs'
import { describeForEachSystem } from './support/systems'

// Every file that can carry a CSS length: each system's own stylesheets and
// logic modules (a JS module can write an inline `100vh` just as easily as a
// stylesheet can), plus every Astro page and layout that renders one, since a
// length can land in a page's own <style> too. Scoping this to one
// stylesheet would miss the next violation added anywhere else in either
// tree.
//
// Both globs are deliberately system-agnostic rather than scoped to the one
// system that exists today: a guard that only ever scanned `vanilla` would
// keep passing while a new port shipped the very violation it exists to
// catch. The extension list covers the source languages a design-system port
// plausibly ships in, for the same reason.
const SCANNED_FILES = [
  ...globSync('systems/*/src/**/*.{css,scss,js,jsx,mjs,ts,tsx,vue,svelte}'),
  ...globSync('site/src/**/*.astro'),
]

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
    // Guards the guard: an empty list would make the loop below vacuously
    // pass no matter what any file contained.
    expect(SCANNED_FILES.length).toBeGreaterThan(0)
    for (const file of SCANNED_FILES) {
      const contents = readFileSync(file, 'utf8')
      expect(contents, `${file} uses vh where dvh is required`).not.toMatch(BARE_VH)
    }
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

    // The system's own reduced-motion media query collapses every transition
    // it names to 1ms, which is what makes the position check above
    // meaningful rather than a slide merely caught mid-flight.
    const transitionDuration = await sheet.evaluate((el) => getComputedStyle(el).transitionDuration)
    expect(transitionDuration).toBe('0.001s')
  })
})
