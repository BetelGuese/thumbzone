import { test, type CDPSession } from '@playwright/test'

/**
 * Whether a computed `touch-action` still lets the browser claim a vertical
 * pan for itself.
 *
 * This is the semantic the pattern actually depends on, rather than any one
 * spelling of it: a surface the user drags (the sheet's handle) or that
 * merely covers the page (the scrim) must not hand a vertical touch to native
 * scrolling, while the menu must always hand it over. `none`, `pinch-zoom`
 * and `pan-x` all block a vertical pan and are all legitimate choices —
 * `pinch-zoom` is the one the reference implementation makes, because it keeps
 * pinch-to-zoom working (WCAG 1.4.4), and that exact value is pinned for
 * vanilla in its own reference spec.
 *
 * `manipulation` counts as permissive: it only drops double-tap zoom, and
 * leaves panning entirely to the browser.
 */
export function permitsVerticalPanning(touchAction: string): boolean {
  const tokens = touchAction.trim().toLowerCase().split(/\s+/)
  if (tokens.includes('auto') || tokens.includes('manipulation')) return true
  return tokens.some((token) => token === 'pan-y' || token === 'pan-up' || token === 'pan-down')
}

/**
 * Whether a computed `touch-action` leaves pinch-to-zoom available to the
 * browser (WCAG 1.4.4).
 *
 * Per the touch-action spec, `pinch-zoom` is only ever granted if it is
 * explicitly named — `auto` and `manipulation` carry it implicitly, but
 * `none` and every bare `pan-*` keyword (including the ones that also block
 * vertical panning, like `pan-x`) suppress it. That is exactly the gap this
 * predicate closes: `permitsVerticalPanning` treats `none` and `pinch-zoom`
 * as equally valid ways to block a pan, but only one of them keeps zoom
 * alive, and a surface that covers the whole viewport (the scrim) has no
 * business taking that away from the rest of the page.
 */
export function permitsPinchZoom(touchAction: string): boolean {
  const tokens = touchAction.trim().toLowerCase().split(/\s+/)
  return tokens.includes('auto') || tokens.includes('manipulation') || tokens.includes('pinch-zoom')
}

/**
 * Skips the calling test unless real touch input can be driven on this
 * engine. CDP sessions are a Chromium-only capability; there is no equivalent
 * available for WebKit through Playwright, and page.mouse exercises no
 * engine's touch-action arbitration, so this coverage is Chromium-only by
 * necessity rather than by choice. The skip stays visible per system.
 */
export function skipWithoutRealTouch(browserName: string): void {
  test.skip(
    browserName !== 'chromium',
    'No CDP (or equivalent) touch-drag simulation is available for WebKit through Playwright; ' +
      'page.mouse does not exercise real touch-action arbitration on any engine.',
  )
}

/**
 * Drives a real touch sequence via the Chrome DevTools Protocol rather than
 * page.mouse. This is the one mechanism available through Playwright that
 * exercises a browser's actual touch-action/scroll-arbitration pipeline —
 * page.mouse produces pointer events with pointerType 'mouse' even under
 * hasTouch, which never engages that pipeline at all, and page.touchscreen
 * only supports tap(), not a drag.
 */
export async function cdpTouchDrag(
  client: CDPSession,
  x: number,
  startY: number,
  distance: number,
  steps = 12,
): Promise<void> {
  const touchPoint = (y: number) => [{ x, y, radiusX: 11, radiusY: 11, id: 0 }]
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoint(startY) })
  for (let i = 1; i <= steps; i += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: touchPoint(startY + (distance * i) / steps),
    })
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
