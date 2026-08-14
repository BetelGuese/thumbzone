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

  // A dead switcher is invisible from the page's appearance — the frame still
  // shows a working demo, just always the same one. Asserting the framed
  // document actually changed is the only thing that catches it.
  test('swaps the framed system without navigating away', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')

    // Guards this test against a one-system registry, where "switching"
    // would be unobservable and the assertions below would pass trivially.
    expect(SHIPPED_SYSTEMS.length).toBeGreaterThan(1)
    const target = SHIPPED_SYSTEMS[1]

    await page.locator(`a[data-tz-system="${target.id}"]`).click()

    await expect(page.locator('iframe[data-tz-frame]')).toHaveAttribute('src', target.route)
    // The page itself must not have navigated: the whole point of
    // intercepting is that the reader stays on the argument.
    expect(new URL(page.url()).pathname).toBe('/')
    await expect(page.locator(`a[data-tz-system="${target.id}"]`)).toHaveAttribute('aria-current', 'page')
    // Exactly one link is current, so the previous one was cleared.
    await expect(page.locator('a[data-tz-system][aria-current="page"]')).toHaveCount(1)
  })

  test('leaves the trigger reachable inside the framed demo after a swap', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    const target = SHIPPED_SYSTEMS[1]
    await page.locator(`a[data-tz-system="${target.id}"]`).click()

    // Reaches into the framed document, which is where the claim actually
    // lives: a swap that loaded the route but produced a frame too wide for
    // the pattern would pass every assertion above.
    const framed = page.frameLocator('iframe[data-tz-frame]')
    await expect(framed.locator('[data-tz-trigger]')).toBeVisible()
  })
})

// The links are the page's whole control surface, and the script only
// enhances them. With scripting off they must still go somewhere real —
// this is the same fallback the below-breakpoint path relies on, so a
// regression here breaks both at once.
test.describe('showcase without scripting', () => {
  test.use({ javaScriptEnabled: false })

  test('falls back to navigating to the demo route', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    const target = SHIPPED_SYSTEMS[1]
    await page.locator(`a[data-tz-system="${target.id}"]`).click()
    await expect(page).toHaveURL(new RegExp(`${target.route}$`))
  })
})
