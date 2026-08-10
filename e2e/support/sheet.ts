import { type Page } from '@playwright/test'

/**
 * Opens the sheet via the trigger and waits for its open transition to
 * finish.
 *
 * A click resolves as soon as the event dispatches, well before the sheet's
 * 240ms open transition completes, and a bounding box read before it settles
 * is a transient mid-animation position rather than the final layout. Two
 * kinds of assertion depend on that distinction: a drag builds its start
 * coordinates from the sheet's live box (mid-transition, the pointerdown
 * lands on the scrim behind it instead), and the layout checks compare one
 * element's position against another's (handle vs. menu, link vs. link),
 * which flex layout, safe-area insets and dvh together do not guarantee to
 * preserve mid-flight.
 */
export async function openSheetAndSettle(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sheet = document.querySelector('[data-tz-sheet]') as HTMLElement
    window.__sheetSettled = new Promise((resolve) => {
      const onEnd = (event: TransitionEvent) => {
        if (event.propertyName !== 'transform') return
        sheet.removeEventListener('transitionend', onEnd)
        resolve()
      }
      sheet.addEventListener('transitionend', onEnd)
    })
  })
  await page.locator('[data-tz-trigger]').click()
  await page.evaluate(() => window.__sheetSettled)
}
