import { test, type CDPSession } from '@playwright/test'

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
