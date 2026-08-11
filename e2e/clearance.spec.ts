import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openSheetAndSettle } from './support/sheet'
import { describeForEachSystem, describeOverflowFixture } from './support/systems'

/**
 * The trigger floats *above* the open sheet by design — tapping it is a close
 * path, so it has to stay hit-testable over the sheet rather than sliding
 * beneath it — which only reads as "floating above" rather than "covering" if
 * the sheet's last row never ends up underneath it.
 *
 * Asserted as a direct bounding-box comparison rather than by trusting whichever
 * padding formula a port reserves the clearance with. Every system expresses that
 * calculation in its own terms — a spacing token here, a component's fixed size
 * there — and a change to one term of it in isolation is exactly how the overlap
 * reopens; the rendered geometry is the only thing all of them can be held to.
 */
async function expectTriggerClearsLastMenuRow(page: Page): Promise<void> {
  const triggerBox = (await page.locator('[data-tz-trigger]').boundingBox())!
  const lastRowBox = (await page.locator('[data-tz-menu] a').last().boundingBox())!

  expect(
    triggerBox.y,
    "the trigger, floating above the open sheet, must not cover the last menu row's bottom edge",
  ).toBeGreaterThanOrEqual(lastRowBox.y + lastRowBox.height)
}

describeForEachSystem('trigger/sheet clearance', (system) => {
  test('the trigger never covers the last row of a short menu', async ({ page }) => {
    await page.goto(system.route)
    await openSheetAndSettle(page)

    await expectTriggerClearsLastMenuRow(page)
  })

  // The short fixture never scrolls, so it cannot prove the reserved clearance
  // survives once the menu is a scroll container of its own: the last row there
  // is only reachable by scrolling the menu to its own end first, which is also
  // the one position where the overlap this guards is visible to a real user.
  describeOverflowFixture(system, 'overflowing menu', (overflowRoute) => {
    test('the trigger never covers the last row of an overflowing menu scrolled to its end', async ({ page }) => {
      await page.goto(overflowRoute)
      await openSheetAndSettle(page)

      const menu = page.locator('[data-tz-menu]')
      await menu.evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      // Guards the premise: scrolled-to-the-end is the whole point of this case,
      // so a fixture that stopped overflowing would leave this a silent
      // duplicate of the short-menu test above while still claiming to cover it.
      expect(
        await menu.evaluate((el) => el.scrollTop),
        'the overflow fixture must author a menu tall enough to scroll',
      ).toBeGreaterThan(0)

      await expectTriggerClearsLastMenuRow(page)
    })
  })
})
