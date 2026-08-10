import { test, expect, type Page } from '@playwright/test'
import { SCROLL_THRESHOLD } from '../systems/vanilla/src/thumbzone.js'

// The demo route exposes the initThumbzone() handle (and the constructor
// itself) on window purely for tests — see open-close.spec.ts and
// gestures.spec.ts, which declare the same augmentation for the same reason:
// destroy() and re-init have no attribute-driven equivalent a test could
// trigger from the DOM alone.
declare global {
  interface Window {
    __thumbzone?: { open: () => void; close: () => void; destroy: () => void }
    __initThumbzone?: (refs: {
      trigger: Element | null
      sheet: Element | null
      scrim: Element | null
      menu: Element | null
      inertRoot: Element | null
    }) => { open: () => void; close: () => void; destroy: () => void }
  }
}

// A wide margin above the jitter threshold, derived from the exported
// constant rather than a bare literal, so these two added scenarios keep
// meaning "comfortably past the threshold" if it's ever retuned.
const SCROLL_PAST_THRESHOLD = SCROLL_THRESHOLD * 50
// A second, smaller nudge past the threshold, used only for a scroll that
// must land mid-document rather than at its end — the fixture's scrollable
// range is nowhere near two lots of SCROLL_PAST_THRESHOLD, and landing on
// the document's actual end would trigger createScrollDirectionTracker's
// own "always show at the end" rule for a reason that has nothing to do
// with whatever this scroll is meant to test.
const SCROLL_NUDGE = SCROLL_THRESHOLD * 10

// Mirrors gestures.spec.ts's own helper of the same name: a click resolves
// as soon as the event dispatches, well before the sheet's 240ms open
// transition finishes. Reading a bounding box before it settles hands back
// a transient, mid-animation position instead of the final layout — this
// matters here specifically because several assertions below compare one
// element's position against another's (handle vs. menu, link vs. link),
// and a mid-transition read is not guaranteed to preserve those relative
// positions once flex layout, safe-area insets, and dvh all factor in.
async function openSheetAndSettle(page: Page) {
  await page.evaluate(() => {
    const sheet = document.querySelector('[data-tz-sheet]') as HTMLElement
    ;(window as unknown as { __sheetSettled: Promise<void> }).__sheetSettled = new Promise((resolve) => {
      const onEnd = (event: TransitionEvent) => {
        if (event.propertyName !== 'transform') return
        sheet.removeEventListener('transitionend', onEnd)
        resolve()
      }
      sheet.addEventListener('transitionend', onEnd)
    })
  })
  await page.locator('[data-tz-trigger]').click()
  await page.evaluate(() => (window as unknown as { __sheetSettled: Promise<void> }).__sheetSettled)
}

/**
 * Waits out one full rendering frame. window.scrollBy()/scrollTo() update
 * scrollY synchronously, but Chromium does not always dispatch the
 * corresponding 'scroll' event in the same task — confirmed directly: a
 * scroll issued shortly after another DOM mutation (such as open()'s
 * attribute/inert toggling) can update scrollY with its 'scroll' event not
 * reaching listeners until a later frame. Because the assertions below are
 * `not.toHaveAttribute` checks that already pass trivially on a
 * not-yet-tucked trigger, an unsettled scroll would let the test resolve
 * green without the event the implementation reacts to ever having fired —
 * a false pass, not a real one. Two nested requestAnimationFrame calls
 * guarantee at least one full frame has completed.
 */
async function settleScroll(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

test.describe('scroll-aware trigger', () => {
  test('tucks away on scroll down and returns on scroll up', async ({ page }) => {
    await page.goto('/demo/vanilla')
    const trigger = page.locator('[data-tz-trigger]')

    // window.scrollBy rather than page.mouse.wheel(): Playwright has no
    // wheel-input emulation for mobile WebKit at all ("Mouse wheel is not
    // supported in mobile WebKit", confirmed directly), and this suite must
    // pass on both device projects. scrollBy moves the real document
    // scrollY and fires the same native 'scroll' event a wheel gesture
    // would — the listener under test reacts to that event and to
    // window.scrollY alone, never to how the scroll was produced.
    await page.evaluate(() => window.scrollBy(0, 400))
    await settleScroll(page)
    await expect(trigger).toHaveAttribute('data-tz-tucked', 'true')

    await page.evaluate(() => window.scrollBy(0, -200))
    await settleScroll(page)
    await expect(trigger).not.toHaveAttribute('data-tz-tucked', 'true')
  })

  test('is always visible at the end of the document', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await settleScroll(page)
    await expect(page.locator('[data-tz-trigger]')).not.toHaveAttribute('data-tz-tucked', 'true')
  })

  // Resolution: the trigger and an open sheet never compete for the thumb's
  // reach at once, so tucking must both clear on open and stay cleared for
  // any scroll that arrives while the sheet is still open.
  test('never tucks while the sheet is open, even if a scroll arrives', async ({ page }) => {
    await page.goto('/demo/vanilla')
    const trigger = page.locator('[data-tz-trigger]')

    // Get it tucked first, so what's under test is genuinely "cleared on
    // open" rather than "never got set in the first place" — starting from
    // an already-untucked trigger could not tell the two apart. See the
    // note on the test above for why this is scrollBy rather than
    // mouse.wheel.
    await page.evaluate((n) => window.scrollBy(0, n), SCROLL_PAST_THRESHOLD)
    await settleScroll(page)
    await expect(trigger).toHaveAttribute('data-tz-tucked', 'true')

    // Driven through the open() handle directly, not a tap on the trigger:
    // fully tucked is translated off-screen by design, so a real click
    // there is not something a genuine user gesture could deliver either —
    // open()'s own promise to clear the tucked state does not depend on
    // which input path called it.
    await page.evaluate(() => window.__thumbzone?.open())
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
    await expect(trigger).not.toHaveAttribute('data-tz-tucked', 'true')

    // A real background scroll while the sheet is open: window.scrollBy
    // changes document scrollY and fires a genuine 'scroll' event,
    // independent of where the mouse happens to be — the trigger renders
    // above the open sheet (by design, so a tap there can still close it),
    // which would make a mouse-wheel-based scroll depend on exactly which
    // fixed element the pointer sits over. The listener itself only cares
    // about window.scrollY and open state, so this exercises the identical
    // code path a genuine background scroll would. A small nudge, not
    // another full SCROLL_PAST_THRESHOLD: the fixture is already close to
    // the bottom of its scroll range from the first scroll above, and
    // landing exactly on the document's end would trigger "always show"
    // regardless of the open check this is meant to isolate.
    await page.evaluate((n) => window.scrollBy(0, n), SCROLL_NUDGE)
    await settleScroll(page)
    await expect(trigger).not.toHaveAttribute('data-tz-tucked', 'true')
  })

  // Resolution: the menu, not the sheet, is the scroll container now — its
  // own overflow scrolling must be a completely separate signal from
  // document scroll, or an overflowing menu (see the dedicated fixture
  // below) would tuck the trigger the instant a user reads through it.
  test('does not tuck when the overflowing menu itself is scrolled', async ({ page }) => {
    await page.goto('/demo/vanilla-overflow')
    const trigger = page.locator('[data-tz-trigger]')
    await trigger.click()
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')

    const menu = page.locator('[data-tz-menu]')
    await menu.evaluate((el) => {
      el.scrollTop = el.scrollHeight
      el.dispatchEvent(new Event('scroll'))
    })
    // Guards the premise: this only proves the trigger's isolation from
    // menu-scrolling if the menu actually scrolled.
    expect(await menu.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)

    await expect(trigger).not.toHaveAttribute('data-tz-tucked', 'true')
  })
})

test.describe('menu order', () => {
  test('renders the first authored item nearest the thumb', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await openSheetAndSettle(page)

    const links = page.locator('[data-tz-menu] a')
    const count = await links.count()
    const boxes = await Promise.all(
      Array.from({ length: count }, (_, i) => links.nth(i).boundingBox()),
    )

    // 'Home' is authored first in the route, so it must sit lowest on screen.
    const homeIndex = (await links.allTextContents()).indexOf('Home')
    const homeY = boxes[homeIndex]!.y
    const otherYs = boxes.filter((_, i) => i !== homeIndex).map((b) => b!.y)
    expect(Math.min(...otherYs)).toBeLessThan(homeY)
  })

  // Adapted per the self-managed focus trap: initThumbzone owns Tab cycling
  // itself (WebKit omits plain <a href> elements from native tab order
  // entirely), and open() auto-focuses the first link. Pressing Tab exactly
  // `count` times from there would walk through every remaining link and
  // then wrap the trap back to that same first (topmost) link — appending
  // its low y-value at the end of the sequence, which would make even a
  // fully correct, monotonically-increasing focus order fail this
  // assertion for a reason that has nothing to do with WCAG 1.3.2. Reading
  // the initial focus target directly and then tabbing one short of a full
  // cycle visits every link exactly once, in order, with no wrap.
  test('keeps focus order matching visual order', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await openSheetAndSettle(page)

    const links = page.locator('[data-tz-menu] a')
    const count = await links.count()
    const ys: number[] = [await page.evaluate(() => document.activeElement!.getBoundingClientRect().y)]
    for (let i = 1; i < count; i += 1) {
      await page.keyboard.press('Tab')
      ys.push(await page.evaluate(() => document.activeElement!.getBoundingClientRect().y))
    }
    const sorted = [...ys].sort((a, b) => a - b)
    expect(ys).toEqual(sorted)
  })

  // Resolution: the reorder must trust that menu.children holds only real
  // list items — the drag handle is authored as the menu's sibling inside
  // the sheet, not one of its children, but that structural assumption is
  // exactly the kind of thing worth checking directly rather than trusting.
  test('does not reorder or drop the drag handle', async ({ page }) => {
    await page.goto('/demo/vanilla')

    const handleIsMenuChild = await page.evaluate(() => {
      const menu = document.querySelector('[data-tz-menu]')!
      const handle = document.querySelector('[data-tz-handle]')!
      return Array.from(menu.children).includes(handle)
    })
    expect(handleIsMenuChild).toBe(false)

    await openSheetAndSettle(page)

    const handle = page.locator('[data-tz-handle]')
    await expect(handle).toBeAttached()
    await expect(handle).toHaveAttribute('aria-hidden', 'true')

    // Still authored above the menu inside the sheet, regardless of how the
    // menu's own items got reordered.
    const handleBox = (await handle.boundingBox())!
    const menuBox = (await page.locator('[data-tz-menu]').boundingBox())!
    expect(handleBox.y + handleBox.height).toBeLessThanOrEqual(menuBox.y + 1)
  })

  // Resolution: the opt-out has to actually be wired up, not just
  // documented. There's no fixture route authored with the attribute
  // already set — the reorder runs once, synchronously, during
  // initThumbzone — so this drives it through the same destroy()/re-init
  // hooks gestures.spec.ts uses to exercise other init-time-only behaviour.
  test('data-tz-order="dom" opts out of the reorder', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await page.evaluate(() => window.__thumbzone?.destroy())
    await page.evaluate(() => {
      document.querySelector('[data-tz-menu]')!.setAttribute('data-tz-order', 'dom')
    })
    await page.evaluate(() => {
      window.__thumbzone = window.__initThumbzone?.({
        trigger: document.querySelector('[data-tz-trigger]'),
        sheet: document.querySelector('[data-tz-sheet]'),
        scrim: document.querySelector('[data-tz-scrim]'),
        menu: document.querySelector('[data-tz-menu]'),
        inertRoot: document.querySelector('[data-tz-app]'),
      })
    })

    const texts = await page.locator('[data-tz-menu] a').allTextContents()
    expect(texts[0]).toBe('Home')
  })

  // Global constraint: destroy() must fully restore the pre-init DOM state,
  // including whatever this task adds — the reorder has no CSS counterpart
  // to fall back to, so leaving it in place after teardown would mean a
  // destroyed instance and a never-initialised page no longer look alike.
  // Derives the expected original order from the live (already-reordered)
  // list rather than hardcoding the route's item names, so this stays
  // correct if the fixture's menu items ever change.
  test('destroy() restores the pre-reorder menu order', async ({ page }) => {
    await page.goto('/demo/vanilla')
    const reorderedTexts = await page.locator('[data-tz-menu] a').allTextContents()
    const expectedOriginalOrder = [...reorderedTexts].reverse()

    await page.evaluate(() => window.__thumbzone?.destroy())

    const restoredTexts = await page.locator('[data-tz-menu] a').allTextContents()
    expect(restoredTexts).toEqual(expectedOriginalOrder)
  })

  // Same constraint, for the other DOM mutation this task adds: data-tz-tucked
  // has no authored default either, so a destroyed instance must not leave
  // it behind.
  test('destroy() clears any tucked state left on the trigger', async ({ page }) => {
    await page.goto('/demo/vanilla')
    const trigger = page.locator('[data-tz-trigger]')
    await page.evaluate(() => window.scrollBy(0, 400))
    await settleScroll(page)
    await expect(trigger).toHaveAttribute('data-tz-tucked', 'true')

    await page.evaluate(() => window.__thumbzone?.destroy())

    await expect(trigger).not.toHaveAttribute('data-tz-tucked', 'true')
  })
})
