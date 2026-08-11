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
    /** Test hook every demo route exposes — see System.route in the registry. */
    __thumbzoneReady?: Promise<void>
    /** Test-owned scratch space; see scrollAndSettle. */
    __scrollCount?: number
  }
}

/**
 * Waits until the route reports the pattern fully settled: wired, and with
 * anything that arrives after the wiring — a framework hydrating over the same
 * server-rendered markup — finished with it.
 *
 * Every hook-driven teardown and re-initialisation goes through this first, and
 * the reason is structural rather than cosmetic. Those two are the only things in
 * the suite that reorder the menu's items *after* load, and a framework hydrating
 * the same markup walks those items as siblings while holding a pointer into the
 * list across the tasks it yields between. A reorder landing in one of those gaps
 * leaves it short of the nodes it still expects, which it answers by discarding
 * its tree and re-rendering it — replacing the elements `window.__thumbzone` is
 * holding, so the page keeps working while the handle the suite drives goes dead.
 * Waiting removes the window rather than narrowing it.
 *
 * Costs nothing for a system with nothing to wait for: those routes publish an
 * already-resolved promise.
 */
export async function awaitThumbzoneReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if (!window.__thumbzoneReady) throw new Error('the demo route must expose window.__thumbzoneReady')
    await window.__thumbzoneReady
  })
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
  await awaitThumbzoneReady(page)
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
  await awaitThumbzoneReady(page)
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
