import { expect, type Page } from '@playwright/test'

/**
 * Longest a settle is allowed to wait before handing control back.
 *
 * On expiry the helper *returns* rather than throwing: whatever the caller was
 * about to assert is a better description of the problem than "a helper timed
 * out", and a port whose sheet never settles should fail on a real assertion
 * about the sheet, not on the plumbing that waited for it.
 */
const SETTLE_TIMEOUT_MS = 2000

/**
 * Opens the sheet via the trigger and waits for its open animation to finish.
 *
 * A click resolves as soon as the event dispatches, well before the sheet has
 * arrived, and a bounding box read before it settles is a transient
 * mid-animation position rather than the final layout. Two kinds of assertion
 * depend on that distinction: a drag builds its start coordinates from the
 * sheet's live box (mid-animation, the pointerdown lands on the scrim behind
 * it instead), and the layout checks compare one element's position against
 * another's (handle vs. menu, link vs. link), which flex layout, safe-area
 * insets and dvh together do not guarantee to preserve mid-flight.
 *
 * The wait goes through `getAnimations()` rather than a `transitionend`
 * listener so that it is not itself a hidden requirement to animate with CSS
 * transitions: it settles equally for a CSS transition, a CSS animation, or a
 * Web Animations API port. Waiting on `transitionend` alone would leave a
 * WAAPI port hanging until the test timed out, which tells a porter nothing.
 */
export async function openSheetAndSettle(page: Page): Promise<void> {
  await page.locator('[data-tz-trigger]').click()
  // Fail here, loudly, rather than settling something that never opened.
  await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')

  await page.evaluate(async (timeoutMs) => {
    const sheet = document.querySelector('[data-tz-sheet]') as HTMLElement
    // Two frames: one for the attribute change to be styled, one for any
    // transition or animation it triggers to exist. Sampling getAnimations()
    // in the same task as the click would find an empty list and settle before
    // the sheet had moved at all.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    // An animation cut short by a later style change rejects rather than
    // resolving; an interrupted open still means "no longer in flight".
    const finished = Promise.all(
      sheet.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    )
    await Promise.race([finished, new Promise((resolve) => setTimeout(resolve, timeoutMs))])
  }, SETTLE_TIMEOUT_MS)
}
