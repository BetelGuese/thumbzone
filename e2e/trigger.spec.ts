import { test, expect } from '@playwright/test'
// Both values come from the normative implementation rather than being
// restated here, so the suite and the stylesheet cannot disagree about what
// the contract is.
import { DESKTOP_BREAKPOINT, MIN_HIT_TARGET } from '../systems/vanilla/src/thumbzone.js'
import { describeForEachSystem } from './support/systems'

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
})
