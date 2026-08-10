import { type Page } from '@playwright/test'

/**
 * Installs a counting 'scroll' listener on window exactly once per page —
 * idempotent, so `scrollAndSettle` can call it before every scroll without
 * caring whether an earlier call in the same test already has.
 */
async function ensureScrollCounter(page: Page): Promise<void> {
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
 * open()'s attribute/inert toggling — and nearly every assertion downstream
 * of a scroll is a `not.toHaveAttribute` check that already passes trivially
 * on an untucked trigger. Waiting on a fixed number of frames would let such
 * a test resolve green without the event under test ever having fired;
 * waiting on the count is a direct, not inferred, proof it did.
 */
export async function scrollAndSettle(page: Page, act: () => Promise<void>): Promise<void> {
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
 * change, which is exactly the kind of input the jitter threshold's
 * absorption exists for. The mouse is never moved to a specific element
 * first: at its default (0,0), it sits over the page's own top-of-document
 * content on every fixture, never over the bottom-anchored
 * trigger/sheet/scrim, so a wheel there always reaches the document.
 */
export async function scrollDocument(page: Page, browserName: string, amount: number): Promise<void> {
  await scrollAndSettle(page, async () => {
    if (browserName === 'webkit') {
      await page.evaluate((n) => window.scrollBy(0, n), amount)
    } else {
      await page.mouse.wheel(0, amount)
    }
  })
}
