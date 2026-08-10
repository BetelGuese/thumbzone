import { test, expect, type Page } from '@playwright/test'

test.describe('open and close', () => {
  test('opens on trigger tap and reports expanded state', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await page.locator('[data-tz-trigger]').click()
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
    await expect(page.locator('[data-tz-trigger]')).toHaveAttribute('aria-expanded', 'true')
  })

  test('moves focus into the sheet on open', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await page.locator('[data-tz-trigger]').click()
    const focusedInSheet = await page.evaluate(
      () => !!document.activeElement?.closest('[data-tz-sheet]'),
    )
    expect(focusedInSheet).toBe(true)
  })

  test('makes background content inert while open', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await page.locator('[data-tz-trigger]').click()
    await expect(page.locator('[data-tz-app]')).toHaveAttribute('inert', '')
  })

  test('traps focus inside the sheet', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await page.locator('[data-tz-trigger]').click()
    const linkCount = await page.locator('[data-tz-menu] a').count()
    for (let i = 0; i < linkCount + 2; i += 1) await page.keyboard.press('Tab')
    const stillInSheet = await page.evaluate(
      () => !!document.activeElement?.closest('[data-tz-sheet]'),
    )
    expect(stillInSheet).toBe(true)
  })

  // A closed sheet is fully rendered (merely translated off-screen), not
  // `hidden` — `initThumbzone` must take the sheet out of the tab order and
  // accessibility tree itself via `inert`, or its menu links stay reachable
  // by a keyboard/screen-reader user even though the sheet looks closed.
  test('keeps a closed sheet inert and out of the tab order', async ({ page }) => {
    await page.goto('/demo/vanilla')

    // The direct, engine-independent signal: WebKit does not put plain
    // `<a href>` elements without a tabindex in its native Tab sequence at
    // all (unlike Chromium and Firefox), so a keyboard sweep alone cannot
    // prove the sheet is reachable or not on every engine. `inert` is what
    // actually removes the subtree from the accessibility tree that a
    // screen reader walks, so assert it directly.
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('inert', '')

    // Belt-and-braces for engines where Tab does traverse the links:
    // sweep past every element the document could hand focus to and
    // confirm none of them land inside the sheet either. Deriving the
    // count from the page itself (rather than a literal like "6") means
    // the sweep still covers the whole tab order if the fixture grows
    // another focusable element.
    const focusableCount = await page
      .locator(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      .count()

    for (let i = 0; i < focusableCount + 2; i += 1) {
      await page.keyboard.press('Tab')
      const focusedInSheet = await page.evaluate(
        () => !!document.activeElement?.closest('[data-tz-sheet]'),
      )
      expect(focusedInSheet).toBe(false)
    }
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
        await page.goto('/demo/vanilla')
        await page.locator('[data-tz-trigger]').click()
        await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')

        await closer.act(page)

        await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-open', 'true')
        await expect(page.locator('[data-tz-trigger]')).toHaveAttribute('aria-expanded', 'false')
        await expect(page.locator('[data-tz-app]')).not.toHaveAttribute('inert', '')
        await expect(page.locator('[data-tz-trigger]')).toBeFocused()
      })
    }
  })
})
