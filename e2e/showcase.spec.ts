import { test, expect } from '@playwright/test'
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
    for (const system of PLANNED_SYSTEMS) {
      await expect(planned, `${system.label} is missing from the roadmap`).toContainText(system.label)
    }
  })
})
