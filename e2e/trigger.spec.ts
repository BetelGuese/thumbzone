import { test, expect } from '@playwright/test'
// Every value comes from core rather than being restated here, so the suite
// and the stylesheet cannot disagree about what the contract is.
import {
  DESKTOP_BREAKPOINT,
  FALLBACK_TRIGGER_LABEL_CLOSED,
  MAX_TRIGGER_BOTTOM_GAP,
  MIN_HIT_TARGET,
} from '../core/index.js'
import { destroyThumbzone, reinitThumbzone } from './support/handles'
import { describeForEachSystem } from './support/systems'

// Distinct from anything the implementation would write for itself, and from
// the word the suite looks for elsewhere: a label the pattern could have
// produced on its own would not show that the authored one survived.
const AUTHORED_TRIGGER_LABEL = 'Navigation'

describeForEachSystem('trigger', (system) => {
  test('is horizontally centred at the bottom of the viewport', async ({ page }) => {
    await page.goto(system.route)
    const trigger = page.locator('[data-tz-trigger]')
    await expect(trigger).toBeVisible()

    const box = (await trigger.boundingBox())!
    const viewport = page.viewportSize()!
    const triggerCentre = box.x + box.width / 2
    expect(Math.abs(triggerCentre - viewport.width / 2)).toBeLessThanOrEqual(1)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    expect(box.y).toBeGreaterThan(viewport.height / 2)
    // The claim the whole project rests on, stated as a bound rather than as
    // "somewhere in the lower half": a trigger at 51% of the viewport height
    // satisfies the line above while sitting nowhere a thumb can reach, so
    // this is the assertion that actually holds a port to thumb placement.
    const gapBelowTrigger = viewport.height - (box.y + box.height)
    expect(
      gapBelowTrigger,
      `the trigger must sit within ${MAX_TRIGGER_BOTTOM_GAP}px of the viewport's bottom edge`,
    ).toBeLessThanOrEqual(MAX_TRIGGER_BOTTOM_GAP)
  })

  test('meets the minimum hit target', async ({ page }) => {
    await page.goto(system.route)
    const trigger = page.locator('[data-tz-trigger]')
    await expect(trigger).toBeVisible()
    const box = (await trigger.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(MIN_HIT_TARGET)
    expect(box.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET)
  })

  // Probed at the breakpoint itself, not at some comfortable width well past
  // it: the constraint is "hidden at widths >= DESKTOP_BREAKPOINT", and a
  // stylesheet that used `min-width: 1000px`, or `max-width` on the mobile
  // side and so left a gap around the boundary, would satisfy a 1024px probe
  // while being wrong at exactly the width that defines the rule.
  test('is hidden from the breakpoint up, and still shown one pixel below it', async ({ page }) => {
    await page.setViewportSize({ width: DESKTOP_BREAKPOINT, height: 800 })
    await page.goto(system.route)
    const trigger = page.locator('[data-tz-trigger]')
    // toBeHidden() alone passes when the locator matches zero elements, so it
    // cannot tell "hidden by CSS" apart from "missing from the DOM". Assert
    // it is attached first so a regression that drops the element entirely
    // still fails here.
    await expect(trigger).toBeAttached()
    await expect(trigger).toBeHidden()

    // The other side of the same boundary, so that "hidden at desktop widths"
    // cannot be satisfied by a trigger that is simply never shown at all.
    await page.setViewportSize({ width: DESKTOP_BREAKPOINT - 1, height: 800 })
    await expect(trigger).toBeVisible()
  })

  test('has an accessible name and reports collapsed state', async ({ page }) => {
    await page.goto(system.route)
    const trigger = page.locator('[data-tz-trigger]')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger).toHaveAccessibleName(/menu/i)
  })

  // The carried follow-up: the pattern's fallback exists for a *consumer's*
  // unnamed markup, not as a name a port is entitled to ship with. A port
  // that simply never authors an aria-label of its own passes every check
  // above (the fallback matches /menu/i too) and reports zero axe violations
  // (a fallback name is still a name), so this is the one place in the whole
  // suite — and the whole accessibility gate — positioned to catch it.
  //
  // Checked against FALLBACK_TRIGGER_LABEL_CLOSED itself, imported from core
  // rather than restated here: a local copy could silently drift out of step
  // with a wording change in either behaviour module, and comparing against
  // a string that is no longer the actual fallback would make this pass for
  // the wrong reason — exactly the failure mode this assertion exists to
  // rule out. FALLBACK_TRIGGER_LABEL_CLOSED specifically, not its open-state
  // counterpart, because page.goto() lands on the closed state.
  test("authors its own accessible name, rather than the pattern's fallback", async ({ page }) => {
    await page.goto(system.route)
    const trigger = page.locator('[data-tz-trigger]')
    await expect(trigger).not.toHaveAccessibleName(FALLBACK_TRIGGER_LABEL_CLOSED)
  })

  // The check above cannot catch a pattern that writes the accessible name
  // itself: any wording it chose would match, because the fixtures name the
  // trigger after the menu too. A name authored in a port's own words — or in
  // a consumer's own language — must survive initialisation, every state
  // change, and teardown untouched; the open/closed state is aria-expanded's
  // job, not the name's. Driven through destroy()/re-init because the
  // authored value has to be in place before an instance reads it, and no
  // fixture route can author two different names at once.
  test('never overwrites an authored accessible name, and leaves it behind on destroy()', async ({ page }) => {
    await page.goto(system.route)
    const trigger = page.locator('[data-tz-trigger]')

    await destroyThumbzone(page)
    await page.evaluate((label) => {
      document.querySelector('[data-tz-trigger]')!.setAttribute('aria-label', label)
    }, AUTHORED_TRIGGER_LABEL)
    // Re-initialising runs its own open/close cycle, so the name has already
    // survived both state changes by the time this returns.
    await reinitThumbzone(page)
    await expect(trigger).toHaveAccessibleName(AUTHORED_TRIGGER_LABEL)

    await trigger.click()
    // Guards the premise: the state change this name must outlive has to have
    // actually happened, or the assertion after it proves nothing.
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(trigger).toHaveAccessibleName(AUTHORED_TRIGGER_LABEL)

    await destroyThumbzone(page)
    await expect(trigger).toHaveAttribute('aria-label', AUTHORED_TRIGGER_LABEL)
  })

  // The other half of that contract: where the markup authors no name at all,
  // the pattern supplies one — and destroy() must then take back what it
  // added, or a destroyed instance and a never-initialised page stop looking
  // alike.
  test('names an unnamed trigger itself, and removes that name on destroy()', async ({ page }) => {
    await page.goto(system.route)
    const trigger = page.locator('[data-tz-trigger]')

    await destroyThumbzone(page)
    await page.evaluate(() => {
      document.querySelector('[data-tz-trigger]')!.removeAttribute('aria-label')
    })
    await reinitThumbzone(page)

    await expect(trigger).toHaveAccessibleName(/\S/)

    await destroyThumbzone(page)
    await expect(trigger).not.toHaveAttribute('aria-label')
  })
})
