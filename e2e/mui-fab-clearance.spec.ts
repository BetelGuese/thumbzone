import { test, expect } from '@playwright/test'
import { openSheetAndSettle } from './support/sheet'

// Project-level, and deliberately not parameterised over the registry — like
// vanilla-reference.spec.ts pins values specific to the normative
// implementation, this pins something specific to *this one port's* own
// concrete dimensions, rather than a requirement the generic conformance
// suite holds every system to.
//
// Scoped to Material UI only, and not run through describeForEachSystem,
// because systems/vanilla's stylesheet has the identical trigger size (56px)
// and bottom offset (16px) and the identical missing clearance on its own
// sheet (systems/vanilla/src/thumbzone.css:6,10-11,80) — a pre-existing,
// disclosed bug in the normative reference itself, not a regression in this
// port. Running this against every registered system today would fail
// Vanilla for that known issue rather than for anything this file means to
// guard. Once vanilla's own padding reserves the same clearance, this can
// move into the generic suite (and the requirement can become a contract
// line rather than a port-specific pin).
const MUI_ROUTE = '/demo/mui'
const MUI_OVERFLOW_ROUTE = '/demo/mui-overflow'

/**
 * The trigger floats *above* the open sheet by design — tapping it is a
 * close path, so it has to stay hit-testable over the sheet rather than
 * sliding beneath it (see the trigger's own zIndex in ThumbzoneMenu) — which
 * only reads as "floating above" rather than "covering" if the sheet's last
 * row never ends up underneath it. Asserted as a direct bounding-box
 * comparison rather than trusting the padding formula that produces it: a
 * future change to FAB_SIZE_PX, the spacing token, or the padding calc in
 * isolation would otherwise silently reopen the exact overlap this guards.
 */
async function expectTriggerClearsLastMenuRow(page: import('@playwright/test').Page): Promise<void> {
  const triggerBox = (await page.locator('[data-tz-trigger]').boundingBox())!
  const lastRowBox = (await page.locator('[data-tz-menu] a').last().boundingBox())!

  expect(
    triggerBox.y,
    "the trigger, floating above the open sheet, must not cover the last menu row's bottom edge",
  ).toBeGreaterThanOrEqual(lastRowBox.y + lastRowBox.height)
}

test.describe('material ui — trigger/sheet clearance', () => {
  test('the trigger never covers the last row of a short menu', async ({ page }) => {
    await page.goto(MUI_ROUTE)
    await openSheetAndSettle(page)

    await expectTriggerClearsLastMenuRow(page)
  })

  // The fixture above never scrolls, so it cannot prove the reserved
  // clearance survives once the menu is a scroll container of its own — the
  // last row there is only reachable by scrolling the menu to its own end
  // first, which is also the one position where the overlap this guards
  // would actually be visible to a real user.
  test('the trigger never covers the last row of an overflowing menu scrolled to its end', async ({ page }) => {
    await page.goto(MUI_OVERFLOW_ROUTE)
    await openSheetAndSettle(page)

    await page.locator('[data-tz-menu]').evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })

    await expectTriggerClearsLastMenuRow(page)
  })
})
