import { expect, type Page } from '@playwright/test'

/** The elements every system's initialiser is handed. */
interface ThumbzoneRefs {
  trigger: Element | null
  sheet: Element | null
  scrim: Element | null
  menu: Element | null
  inertRoot: Element | null
}

/** The imperative handle an initialised instance returns. */
interface ThumbzoneHandle {
  open: () => void
  close: () => void
  destroy: () => void
}

declare global {
  interface Window {
    /** Test hook every demo route exposes — see System.route in the registry. */
    __thumbzone?: ThumbzoneHandle
    /** Test hook every demo route exposes — see System.route in the registry. */
    __initThumbzone?: (refs: ThumbzoneRefs) => ThumbzoneHandle
    /** Test-owned scratch space; see scrollAndSettle. */
    __scrollCount?: number
  }
}

/**
 * Opens the sheet through the instance's own `open()` rather than a tap.
 *
 * Some states — a fully tucked trigger, translated off-screen — are ones no
 * real pointer could reach, and `open()`'s contract does not depend on which
 * input path called it.
 */
export async function openThumbzone(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (!window.__thumbzone) throw new Error('the demo route must expose window.__thumbzone')
    window.__thumbzone.open()
  })
}

/**
 * Tears the instance down. Throws rather than no-oping when the hook is
 * absent: every assertion that follows a teardown is about state having been
 * *restored*, and a silent no-op would leave several of them arguing about
 * the wrong thing.
 */
export async function destroyThumbzone(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (!window.__thumbzone) throw new Error('the demo route must expose window.__thumbzone')
    window.__thumbzone.destroy()
  })
}

/**
 * Re-initialises over the same elements, replacing the handle on `window` so
 * a later `destroyThumbzone` tears down this instance rather than the dead
 * one it succeeded. Pair with `destroyThumbzone` to exercise anything that
 * only happens at init time.
 *
 * Before returning, it proves the new instance actually drives the UI by
 * opening and closing the sheet from real input. Without that, a port could
 * satisfy this hook with a shim that returns an inert handle: every later
 * assertion about "what init did" would then be measuring a page nothing was
 * wired to, and the suite would happily conform the shim. The sheet is left
 * closed again, exactly as it was found.
 */
export async function reinitThumbzone(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (!window.__initThumbzone) throw new Error('the demo route must expose window.__initThumbzone')
    window.__thumbzone = window.__initThumbzone({
      trigger: document.querySelector('[data-tz-trigger]'),
      sheet: document.querySelector('[data-tz-sheet]'),
      scrim: document.querySelector('[data-tz-scrim]'),
      menu: document.querySelector('[data-tz-menu]'),
      inertRoot: document.querySelector('[data-tz-app]'),
    })
  })

  const sheet = page.locator('[data-tz-sheet]')
  await page.locator('[data-tz-trigger]').click()
  await expect(sheet, 're-initialising must produce an instance that drives the live UI').toHaveAttribute(
    'data-tz-open',
    'true',
  )
  await page.keyboard.press('Escape')
  await expect(sheet).not.toHaveAttribute('data-tz-open', 'true')
}
