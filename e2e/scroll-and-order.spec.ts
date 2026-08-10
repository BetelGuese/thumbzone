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
    __scrollCount?: number
  }
}

// Mirrors site/src/pages/demo/vanilla.astro's authored `items` array — the
// independent source of truth the destroy()-restoration test below checks
// against, rather than deriving "original" by reversing whatever the page
// currently renders (which would only prove destroy() inverts a reverse,
// not that it restores what the author actually wrote).
const AUTHORED_MENU_ORDER = ['Home', 'Search', 'Library', 'Profile', 'Settings']

// A wide margin above the jitter threshold, derived from the exported
// constant rather than a bare literal, so these scenarios keep meaning
// "comfortably past the threshold" if it's ever retuned — a bare 400 would
// silently stop meaning that (and one of these tests would false-pass by
// never tucking at all) the moment SCROLL_THRESHOLD crossed it.
const SCROLL_DOWN_PAST_THRESHOLD = SCROLL_THRESHOLD * 50
const SCROLL_UP_PAST_THRESHOLD = SCROLL_THRESHOLD * 25
// A second, smaller nudge past the threshold, used only for a scroll that
// must land mid-document rather than at its end — the fixture's scrollable
// range is nowhere near two lots of SCROLL_DOWN_PAST_THRESHOLD, and landing
// on the document's actual end would trigger createScrollDirectionTracker's
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
 * Installs a counting 'scroll' listener on window exactly once per page —
 * idempotent, so scrollAndSettle can call it before every scroll without
 * caring whether an earlier call in the same test already has.
 */
async function ensureScrollCounter(page: Page) {
  await page.evaluate(() => {
    if (window.__scrollCount !== undefined) return
    window.__scrollCount = 0
    window.addEventListener('scroll', () => {
      window.__scrollCount!++
    })
  })
}

/**
 * Runs `act`, then waits for window's 'scroll' event count to have advanced
 * — proof the implementation's own listener actually saw a 'scroll' event,
 * not just that a frame or two passed. Chromium does not always dispatch
 * 'scroll' in the same task as window.scrollBy()/scrollTo()/a wheel gesture
 * — confirmed directly, especially right after another DOM mutation such as
 * open()'s attribute/inert toggling — and every assertion downstream of a
 * scroll in this file is a `not.toHaveAttribute` check that already passes
 * trivially on an untucked trigger. Waiting on a fixed number of frames
 * would let such a test resolve green without the event under test ever
 * having fired; waiting on the count is a direct, not inferred, proof it did.
 */
async function scrollAndSettle(page: Page, act: () => Promise<void>) {
  await ensureScrollCounter(page)
  const before = await page.evaluate(() => window.__scrollCount!)
  await act()
  await page.waitForFunction((n) => window.__scrollCount! > n, before)
}

/**
 * Scrolls the document by `amount` (positive = down), using whichever
 * mechanism exercises real input on the current engine. WebKit has no
 * wheel-input emulation in Playwright at all ("Mouse wheel is not supported
 * in mobile WebKit", confirmed directly) — window.scrollBy is the only
 * option there. Chromium does support page.mouse.wheel, and it is the more
 * faithful simulation of the two: it goes through the browser's real
 * input/compositor pipeline — coalesced scroll events, a fling's tail
 * reversing direction — rather than an instantaneous JS-level position
 * change, which is exactly the kind of input SCROLL_THRESHOLD's jitter
 * absorption exists for. The mouse is never moved to a specific element
 * first: at its default (0,0), it sits over the page's own top-of-document
 * content on every fixture here, never over the bottom-anchored
 * trigger/sheet/scrim, so a wheel there always reaches the document.
 */
async function scrollDocument(page: Page, browserName: string, amount: number) {
  await scrollAndSettle(page, async () => {
    if (browserName === 'webkit') {
      await page.evaluate((n) => window.scrollBy(0, n), amount)
    } else {
      await page.mouse.wheel(0, amount)
    }
  })
}

test.describe('scroll-aware trigger', () => {
  test('tucks away on scroll down and returns on scroll up', async ({ page, browserName }) => {
    await page.goto('/demo/vanilla')
    const trigger = page.locator('[data-tz-trigger]')

    await scrollDocument(page, browserName, SCROLL_DOWN_PAST_THRESHOLD)
    await expect(trigger).toHaveAttribute('data-tz-tucked', 'true')

    await scrollDocument(page, browserName, -SCROLL_UP_PAST_THRESHOLD)
    await expect(trigger).not.toHaveAttribute('data-tz-tucked', 'true')
  })

  test('is always visible at the end of the document', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await scrollAndSettle(page, () => page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)))
    await expect(page.locator('[data-tz-trigger]')).not.toHaveAttribute('data-tz-tucked', 'true')
  })

  // Resolution: the trigger and an open sheet never compete for the thumb's
  // reach at once, so tucking must both clear on open and stay cleared for
  // any scroll that arrives while the sheet is still open.
  test('never tucks while the sheet is open, even if a scroll arrives', async ({ page, browserName }) => {
    await page.goto('/demo/vanilla')
    const trigger = page.locator('[data-tz-trigger]')

    // Get it tucked first, so what's under test is genuinely "cleared on
    // open" rather than "never got set in the first place" — starting from
    // an already-untucked trigger could not tell the two apart.
    await scrollDocument(page, browserName, SCROLL_DOWN_PAST_THRESHOLD)
    await expect(trigger).toHaveAttribute('data-tz-tucked', 'true')

    // Driven through the open() handle directly, not a tap on the trigger:
    // fully tucked is translated off-screen by design, so a real click
    // there is not something a genuine user gesture could deliver either —
    // open()'s own promise to clear the tucked state does not depend on
    // which input path called it.
    await page.evaluate(() => window.__thumbzone?.open())
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
    await expect(trigger).not.toHaveAttribute('data-tz-tucked', 'true')

    // A small nudge, not another full SCROLL_DOWN_PAST_THRESHOLD: the
    // fixture is already close to the bottom of its scroll range from the
    // first scroll above, and landing exactly on the document's end would
    // trigger "always show" regardless of the open check this is meant to
    // isolate.
    await scrollDocument(page, browserName, SCROLL_NUDGE)
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
    // The dispatch above is synchronous and already handled by the time
    // evaluate() resolves — this is a settle point for consistency with
    // every other scripted scroll in this file, not because this one has
    // shown any timing sensitivity of its own.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

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
    const allYs = boxes.map((b) => b!.y)

    // 'Home' is authored first in the route, so it must sit exactly lowest
    // on screen — the list's maximum y, not merely below at least one other
    // item (which a partial shuffle, not a full reversal, could also
    // satisfy without actually being thumb-first).
    const homeIndex = (await links.allTextContents()).indexOf('Home')
    expect(allYs[homeIndex]).toBe(Math.max(...allYs))
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
    // Strictly increasing, not "already equal to its own sorted self": a
    // stalled trap — Tab never advancing focus, activeElement stuck on the
    // first link — produces a constant array, which is trivially already
    // sorted and would pass a same-as-sorted check without ever proving
    // focus moved at all. That is the single most valuable regression this
    // test exists to catch, since resolution 4 exists precisely because
    // initThumbzone owns Tab cycling rather than trusting native order.
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i]).toBeGreaterThan(ys[i - 1])
    }
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
    expect(texts).toEqual(AUTHORED_MENU_ORDER)
  })

  // Global constraint: destroy() must fully restore the pre-init DOM state,
  // including whatever this task adds — the reorder has no CSS counterpart
  // to fall back to, so leaving it in place after teardown would mean a
  // destroyed instance and a never-initialised page no longer look alike.
  // Checked against the route's own authored order (the independent source
  // of truth), not against a reversal of whatever is currently rendered —
  // the latter would only prove destroy() inverts a reverse, which holds
  // even if the reorder that ran at init was itself wrong.
  test('destroy() restores the pre-reorder menu order', async ({ page }) => {
    await page.goto('/demo/vanilla')

    await page.evaluate(() => window.__thumbzone?.destroy())

    const restoredTexts = await page.locator('[data-tz-menu] a').allTextContents()
    expect(restoredTexts).toEqual(AUTHORED_MENU_ORDER)
  })

  // Same global constraint, and append() (rather than replaceChildren()) is
  // specifically what makes it possible: a non-element node authored
  // between list items — whitespace or a comment, common in hand-written
  // markup even though this project's own fixtures happen not to have any —
  // must survive both the init reorder and this destroy() restoration.
  test('destroy() does not drop non-element nodes from the menu', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await page.evaluate(() => {
      document.querySelector('[data-tz-menu]')!.appendChild(document.createComment('marker'))
    })

    await page.evaluate(() => window.__thumbzone?.destroy())

    const hasComment = await page.evaluate(() =>
      Array.from(document.querySelector('[data-tz-menu]')!.childNodes).some(
        (n) => n.nodeType === Node.COMMENT_NODE,
      ),
    )
    expect(hasComment).toBe(true)
  })

  // Same constraint, for the other DOM mutation this task adds: data-tz-tucked
  // has no authored default either, so a destroyed instance must not leave
  // it behind.
  test('destroy() clears any tucked state left on the trigger', async ({ page, browserName }) => {
    await page.goto('/demo/vanilla')
    const trigger = page.locator('[data-tz-trigger]')
    await scrollDocument(page, browserName, SCROLL_DOWN_PAST_THRESHOLD)
    await expect(trigger).toHaveAttribute('data-tz-tucked', 'true')

    await page.evaluate(() => window.__thumbzone?.destroy())

    await expect(trigger).not.toHaveAttribute('data-tz-tucked', 'true')
  })
})
