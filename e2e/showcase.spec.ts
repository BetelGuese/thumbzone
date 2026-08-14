import { test, expect } from '@playwright/test'
import { DESKTOP_BREAKPOINT } from '../core/index.js'
import { PLANNED_SYSTEMS, SHIPPED_SYSTEMS } from '../systems/registry'

// Project-level, not per-system: this guards one page rather than iterating
// ports, so it sits alongside registry.spec.ts rather than using
// describeForEachSystem. It still reads the registry for everything it
// asserts, so a port that lands without appearing here fails rather than
// going unnoticed.
test.describe('showcase', () => {
  test('offers every shipped system a link to that system’s own route', async ({ page }) => {
    await page.goto('/')

    // Guards the loop below against vacuity: an empty registry would make
    // every assertion inside it pass without comparing anything.
    expect(SHIPPED_SYSTEMS.length).toBeGreaterThan(0)

    for (const system of SHIPPED_SYSTEMS) {
      const link = page.locator(`a[data-tz-system="${system.id}"]`)
      await expect(link, `${system.label} has no switcher link`).toHaveCount(1)
      // A real href, not a placeholder an interceptor happens to make work:
      // this is what the page falls back to with JavaScript off and below
      // the breakpoint, so it has to point somewhere real on its own.
      await expect(link).toHaveAttribute('href', system.route)
      await expect(link).toHaveText(system.label)
    }
  })

  test('names the systems still awaiting a port', async ({ page }) => {
    await page.goto('/')
    const planned = page.locator('[data-tz-planned]')
    await expect(planned).toBeVisible()
    // Guards the loop below against vacuity: an empty registry would make
    // every assertion inside it pass without comparing anything.
    expect(PLANNED_SYSTEMS.length).toBeGreaterThan(0)
    for (const system of PLANNED_SYSTEMS) {
      await expect(planned, `${system.label} is missing from the roadmap`).toContainText(system.label)
    }
  })

  // The trap this page exists to avoid: frame a demo at a comfortable desktop
  // width and the pattern hides itself inside the frame, because every port is
  // doing exactly what the contract tells it to. The page still renders — it
  // just stops proving anything. The width is computed against
  // DESKTOP_BREAKPOINT at build time so this cannot be got wrong by hand; this
  // asserts the *rendered* width, because CSS can override an attribute and
  // the build cannot see that.
  test('frames the demo below the width at which the pattern hides itself', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')

    const frame = page.locator('iframe[data-tz-frame]')
    await expect(frame).toBeVisible()

    const box = (await frame.boundingBox())!
    expect(
      box.width,
      `the frame renders at ${box.width}px; at or above ${DESKTOP_BREAKPOINT}px the framed demo hides its own trigger, sheet and scrim`,
    ).toBeLessThan(DESKTOP_BREAKPOINT)

    // The other side of the same claim: a frame narrowed to nothing would
    // satisfy the bound above while showing no demo at all.
    expect(box.width).toBeGreaterThan(0)
  })

  test('names the framed demo for assistive technology', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    const frame = page.locator('iframe[data-tz-frame]')
    await expect(frame).toHaveAttribute('title', /.+/)
  })

  test('loads a registered demo route into the frame', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    const src = await page.locator('iframe[data-tz-frame]').getAttribute('src')
    // Not a literal: the frame must point at something the registry knows
    // about, so a hand-typed route going stale fails here.
    expect(SHIPPED_SYSTEMS.map((system) => system.route)).toContain(src)
  })
})
