import { test, expect, type Page } from '@playwright/test'
// The focusable-element selector comes from the normative implementation so
// that the suite's definition of "focusable" and the implementations' cannot
// drift apart.
import { FOCUSABLE } from '../systems/vanilla/src/thumbzone.js'
import { destroyThumbzone } from './support/handles'
import { describeForEachSystem } from './support/systems'

describeForEachSystem('open and close', (system) => {
  test('opens on trigger tap and reports expanded state', async ({ page }) => {
    await page.goto(system.route)
    await page.locator('[data-tz-trigger]').click()
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
    await expect(page.locator('[data-tz-trigger]')).toHaveAttribute('aria-expanded', 'true')
  })

  test('moves focus into the sheet on open', async ({ page }) => {
    await page.goto(system.route)
    await page.locator('[data-tz-trigger]').click()
    const focusedInSheet = await page.evaluate(
      () => !!document.activeElement?.closest('[data-tz-sheet]'),
    )
    expect(focusedInSheet).toBe(true)
  })

  test('makes background content inert while open', async ({ page }) => {
    await page.goto(system.route)
    await page.locator('[data-tz-trigger]').click()
    await expect(page.locator('[data-tz-app]')).toHaveAttribute('inert', '')
  })

  test('traps focus inside the sheet, cycling through every link in order', async ({ page }) => {
    await page.goto(system.route)
    await page.locator('[data-tz-trigger]').click()

    const links = page.locator('[data-tz-menu] a')
    // Derived from the rendered menu, not a hardcoded item count or names —
    // a handler that merely called preventDefault() without moving focus
    // anywhere would satisfy a weaker "still inside the sheet" check, so
    // this asserts the exact element focus lands on at every step instead.
    const linkCount = await links.count()
    // A single-link menu satisfies both the forward wrap and the backward one
    // without focus ever having to move anywhere, so a port whose demo
    // authored one item would pass this having proven nothing.
    expect(linkCount, 'the demo menu needs more than one link for a trap to be observable').toBeGreaterThan(1)

    await expect(links.first()).toBeFocused()

    // Forward through every link once; tabbing past the last one must wrap
    // back to the first — that wrap is the trap.
    for (let step = 1; step <= linkCount; step += 1) {
      await page.keyboard.press('Tab')
      await expect(links.nth(step % linkCount)).toBeFocused()
    }

    // Shift+Tab from the first link wraps backward to the last.
    await expect(links.first()).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(links.last()).toBeFocused()
  })

  // A closed sheet is fully rendered (merely translated off-screen), not
  // `hidden` — the implementation must take the sheet out of the tab order and
  // accessibility tree itself via `inert`, or its menu links stay reachable
  // by a keyboard/screen-reader user even though the sheet looks closed.
  test('keeps a closed sheet inert and out of the tab order', async ({ page }) => {
    await page.goto(system.route)

    // The attribute itself.
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('inert', '')

    // The behavioural, engine-independent proof: `inert` blocks
    // *programmatic* focus too, not just sequential Tab traversal. This is
    // the check that actually holds on every engine — WebKit does not put
    // plain `<a href>` elements without a tabindex in its native Tab
    // sequence at all (unlike Chromium and Firefox), so a keyboard sweep
    // alone cannot prove the sheet is unreachable there: it would pass
    // whether or not `inert` was applied, because WebKit already skips
    // these links on Tab regardless. Attempting to focus a link directly
    // has no such blind spot.
    await page.locator('[data-tz-menu] a').first().focus()
    await expect(page.locator('[data-tz-menu] a').first()).not.toBeFocused()

    // Belt-and-braces for engines where Tab does traverse the links:
    // sweep past every element the document could hand focus to and
    // confirm none of them land inside the sheet either. Deriving the
    // count from the page itself (rather than a literal like "6") means
    // the sweep still covers the whole tab order however large the
    // system's own fixture is.
    const focusableCount = await page.locator(FOCUSABLE).count()

    for (let i = 0; i < focusableCount + 2; i += 1) {
      await page.keyboard.press('Tab')
      const focusedInSheet = await page.evaluate(
        () => !!document.activeElement?.closest('[data-tz-sheet]'),
      )
      expect(focusedInSheet).toBe(false)
    }
  })

  test('destroy() while open releases inertRoot instead of stranding it', async ({ page }) => {
    await page.goto(system.route)
    await page.locator('[data-tz-trigger]').click()
    await expect(page.locator('[data-tz-app]')).toHaveAttribute('inert', '')

    await destroyThumbzone(page)

    await expect(page.locator('[data-tz-app]')).not.toHaveAttribute('inert', '')
    // Closing alone would blur focus to <body> with nothing to move it on,
    // since the link it was on just became inert. Tearing down from an open
    // state must hand focus back to the trigger like a normal close() does,
    // or a keyboard user loses their place entirely.
    await expect(page.locator('[data-tz-trigger]')).toBeFocused()
  })

  test.describe('closing', () => {
    const closers: Array<{ name: string; act: (page: Page) => Promise<void> }> = [
      { name: 'Escape', act: (page) => page.keyboard.press('Escape') },
      {
        name: 'scrim tap',
        act: (page) => page.locator('[data-tz-scrim]').click({ position: { x: 10, y: 10 } }),
      },
      { name: 'trigger tap', act: (page) => page.locator('[data-tz-trigger]').click() },
    ]

    for (const closer of closers) {
      test(`closes on ${closer.name} and returns focus to the trigger`, async ({ page }) => {
        await page.goto(system.route)
        await page.locator('[data-tz-trigger]').click()
        await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')

        await closer.act(page)

        await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-open', 'true')
        await expect(page.locator('[data-tz-trigger]')).toHaveAttribute('aria-expanded', 'false')
        await expect(page.locator('[data-tz-app]')).not.toHaveAttribute('inert', '')
        await expect(page.locator('[data-tz-trigger]')).toBeFocused()

        // A sheet that has been open once must go back to being inert on
        // close, not just on first paint. The markup only authors `inert`
        // before the first open; nothing else re-applies it afterwards, so
        // this is the one place that proves the *re*-application, not just
        // the initial state.
        await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('inert', '')
        await page.locator('[data-tz-menu] a').first().focus()
        await expect(page.locator('[data-tz-menu] a').first()).not.toBeFocused()
      })
    }
  })
})

// The closed contract before hydration is only proven by never letting
// JavaScript run at all — with it enabled, Playwright's auto-retrying
// assertions simply wait for hydration and then see the JS-applied value,
// which would pass even if the authored markup itself had regressed. It is
// also the no-JS contract: this is what a user with a failed or blocked
// bundle is left with.
describeForEachSystem('closed markup, before hydration', (system) => {
  test.use({ javaScriptEnabled: false })

  test('the sheet is inert and closed straight from the served HTML', async ({ page }) => {
    await page.goto(system.route)
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('inert', '')
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'false')
  })
})
