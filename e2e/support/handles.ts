import { type Page } from '@playwright/test'

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
    /** Test-owned scratch space; see openSheetAndSettle. */
    __sheetSettled?: Promise<void>
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
}
