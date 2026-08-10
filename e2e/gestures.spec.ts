import { test, expect, type Page } from '@playwright/test'
import { DISMISS_RATIO, FLING_VELOCITY } from '../systems/vanilla/src/thumbzone.js'

// The demo route exposes the initThumbzone() handle on window purely for
// tests: destroy() has no attribute-driven equivalent a test could trigger
// from the DOM alone.
declare global {
  interface Window {
    __thumbzone?: { open: () => void; close: () => void; destroy: () => void }
  }
}

// Playwright dispatches each synthetic pointer event only a couple of
// milliseconds apart in real time. Left unpaced, even a drag meant to be
// "slow" reports an instantaneous velocity of several px/ms between two
// consecutive samples — comfortably past FLING_VELOCITY — and would trip the
// fling-dismiss path a distance-only test never intended to exercise.
// Deriving the pacing from FLING_VELOCITY itself (rather than a hardcoded
// duration) keeps "slow" and "fast" meaningfully apart regardless of the
// sheet's actual height, which differs between device projects.
const SLOW_VELOCITY = FLING_VELOCITY / 3
// A wide margin, paired with few steps in the fast-fling test below, so the
// gesture still lands comfortably past FLING_VELOCITY even if CI/parallel
// load stretches the requested per-step delay well beyond what was asked
// for — a few big jumps stay fast under that stretch, where many small ones
// would not.
const FAST_VELOCITY = FLING_VELOCITY * 8

/**
 * Opens the sheet via the trigger and waits for its open transition to
 * finish. A drag test reads the sheet's live bounding box to build its start
 * coordinates; reading it mid-transition would hand the gesture a point the
 * sheet hasn't visually reached yet, landing the pointerdown on the scrim
 * behind it instead of the sheet.
 */
async function openSheetAndSettle(page: Page) {
  await page.evaluate(() => {
    const sheet = document.querySelector('[data-tz-sheet]') as HTMLElement
    ;(window as unknown as { __sheetSettled: Promise<void> }).__sheetSettled = new Promise((resolve) => {
      const onEnd = (event: TransitionEvent) => {
        if (event.propertyName !== 'transform') return
        sheet.removeEventListener('transitionend', onEnd)
        resolve()
      }
      sheet.addEventListener('transitionend', onEnd)
    })
  })
  await page.locator('[data-tz-trigger]').click()
  await page.evaluate(() => (window as unknown as { __sheetSettled: Promise<void> }).__sheetSettled)
}

/**
 * Presses and drags the sheet down by `distance` px (without releasing),
 * paced to land at roughly `velocity` px/ms so the gesture's real elapsed
 * time — not just its pixel distance — matches what the test means to
 * exercise. Split out from `dragSheet` below so a test can assert on the
 * in-progress state before deciding whether/how to release.
 */
async function beginDragSheet(page: Page, distance: number, velocity: number, steps = 12) {
  const box = (await page.locator('[data-tz-sheet]').boundingBox())!
  const startX = box.x + box.width / 2
  const startY = box.y + 20
  const stepDelayMs = distance / velocity / steps

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(startX, startY + (distance * i) / steps)
    await page.waitForTimeout(stepDelayMs)
  }
}

/** `beginDragSheet` followed immediately by a release. */
async function dragSheet(page: Page, distance: number, velocity: number, steps = 12) {
  await beginDragSheet(page, distance, velocity, steps)
  await page.mouse.up()
}

async function swipeUpOnTrigger(page: Page, distance: number, steps = 8) {
  const box = (await page.locator('[data-tz-trigger]').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i += 1) await page.mouse.move(x, y - (distance * i) / steps)
  await page.mouse.up()
}

test.describe('gestures', () => {
  test('dismisses when dragged past the threshold', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await openSheetAndSettle(page)
    const height = (await page.locator('[data-tz-sheet]').boundingBox())!.height

    await dragSheet(page, height * (DISMISS_RATIO + 0.2), SLOW_VELOCITY)

    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-open', 'true')
  })

  test('springs back when the drag stops short', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await openSheetAndSettle(page)
    const height = (await page.locator('[data-tz-sheet]').boundingBox())!.height

    await dragSheet(page, height * (DISMISS_RATIO - 0.1), SLOW_VELOCITY)

    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-dragging', 'true')
  })

  // The two tests above never drive the drag fast enough to reach
  // FLING_VELOCITY, so neither one proves the velocity-based half of
  // shouldDismiss is actually wired up on the sheet — only the distance half
  // is. A short but fast drag, comfortably under DISMISS_RATIO by distance
  // alone, isolates that other path.
  test('dismisses on a fast fling that never reaches the distance threshold', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await openSheetAndSettle(page)
    const height = (await page.locator('[data-tz-sheet]').boundingBox())!.height

    await dragSheet(page, height * (DISMISS_RATIO - 0.1), FAST_VELOCITY, 4)

    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-open', 'true')
  })

  test('marks the sheet as dragging only while a drag is in progress', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await openSheetAndSettle(page)
    const box = (await page.locator('[data-tz-sheet]').boundingBox())!
    const startX = box.x + box.width / 2
    const startY = box.y + 20

    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-dragging', 'true')

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX, startY + 30)
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-dragging', 'true')

    await page.mouse.up()
    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-dragging', 'true')
  })

  // A cancelled gesture must never reach shouldDismiss. Chromium happens to
  // zero a pointercancel's coordinates, which today makes a cancelled
  // drag's offset clamp to 0 and fall through shouldDismiss's own
  // "offset <= 0" guard by coincidence — but the spec does not require
  // that, and an engine that instead retained the last real coordinates
  // would hand shouldDismiss a positive offset and dismiss a gesture the
  // platform aborted, not one the user released. Dispatching the cancel
  // synthetically with a deliberately large clientY (playing the part of
  // that hypothetical engine) proves the handler ignores the cancel event's
  // own coordinates altogether, rather than merely happening to survive
  // Chromium's specific zeroing.
  test('a cancelled drag springs back regardless of the cancel event\'s own coordinates', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await openSheetAndSettle(page)
    const box = (await page.locator('[data-tz-sheet]').boundingBox())!
    const startX = box.x + box.width / 2
    const startY = box.y + 20

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX, startY + 30)
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-dragging', 'true')

    // Real page.mouse-driven pointer events use pointerId 1 (verified
    // directly against both engines) and the sheet already holds pointer
    // capture for it, so this cancel is indistinguishable from one the
    // platform itself would have dispatched mid-drag.
    await page.locator('[data-tz-sheet]').evaluate((el, clientY) => {
      el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, clientY, bubbles: true }))
    }, startY + box.height * 2)

    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-dragging', 'true')

    // The real pointer is still physically "down"; release it so later
    // tests in the same worker don't start with a stuck mouse button.
    await page.mouse.up()
  })

  // A second finger landing mid-drag (or any non-primary pointer) must not
  // be able to hijack the gesture: without a guard, its pointerdown would
  // silently overwrite the first finger's `drag` state, and the first
  // finger's eventual pointerup would then be discarded on the pointerId
  // mismatch — leaving data-tz-dragging and the inline transform (and the
  // CSS transition they disable) stuck until some later drag happened to
  // clear them.
  test('a second pointer landing mid-drag does not hijack or corrupt the gesture', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await openSheetAndSettle(page)
    const height = (await page.locator('[data-tz-sheet]').boundingBox())!.height

    // Paced the same way as "springs back" above: unpaced, this drag alone
    // reads as a multi-px/ms fling (Playwright dispatches events only a
    // couple of milliseconds apart) and would dismiss regardless of the
    // second pointer this test means to isolate.
    await beginDragSheet(page, height * (DISMISS_RATIO - 0.1), SLOW_VELOCITY)
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-dragging', 'true')

    // A second, non-primary touch landing on the sheet while the first
    // pointer is still down.
    await page.locator('[data-tz-sheet]').evaluate((el) => {
      el.dispatchEvent(
        new PointerEvent('pointerdown', { pointerId: 2, isPrimary: false, clientY: 1, bubbles: true }),
      )
    })

    // The first (real) pointer's own release must still be honoured:
    // released short of the dismiss threshold, it must spring back exactly
    // as it would have without the interloper.
    await page.mouse.up()
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-dragging', 'true')
  })

  // destroy() promises to fully restore the pre-init state; a drag mid-flight
  // at teardown time must not leave data-tz-dragging or an inline transform
  // behind (the former also disables the sheet's CSS transition, so a stray
  // one would leave any *future* open/close animation dead until the next
  // drag happened to clear it). Placed here, alongside the drag helpers,
  // rather than in open-close.spec.ts's own destroy test, since driving a
  // drag needs this file's pointer-sequence machinery.
  test('destroy() mid-drag leaves no dragging state or inline transform behind', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await openSheetAndSettle(page)
    const height = (await page.locator('[data-tz-sheet]').boundingBox())!.height

    await beginDragSheet(page, height * (DISMISS_RATIO - 0.1), SLOW_VELOCITY)
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-dragging', 'true')
    const transformDuringDrag = await page.locator('[data-tz-sheet]').evaluate((el) => (el as HTMLElement).style.transform)
    expect(transformDuringDrag).not.toBe('')

    await page.evaluate(() => window.__thumbzone?.destroy())

    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-dragging', 'true')
    const transformAfterDestroy = await page.locator('[data-tz-sheet]').evaluate((el) => (el as HTMLElement).style.transform)
    expect(transformAfterDestroy).toBe('')

    // The pointer is still physically "down" as far as the OS/browser is
    // concerned; release it so later tests in the same worker don't start
    // with a stuck mouse button.
    await page.mouse.up()
  })

  test('opens on a swipe up from the trigger', async ({ page }) => {
    await page.goto('/demo/vanilla')

    await swipeUpOnTrigger(page, 96)

    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
  })

  // The test above cannot fail if swipe recognition is deleted entirely: a
  // closed sheet ends up open either way — via the swipe if recognition
  // works, or via the click-suppression flag staying false and the trailing
  // synthesized click reaching the ordinary open/close toggle if it does
  // not. Neither path distinguishes a swipe from a tap on its own. Starting
  // from an already-open sheet does distinguish them: a swipe must leave it
  // open, where an unrecognised swipe would fall through to that same
  // toggle and the trailing click would close it instead.
  test('swipe-up on the trigger while already open leaves it open, unlike a tap', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await page.locator('[data-tz-trigger]').click()
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')

    await swipeUpOnTrigger(page, 96)

    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
  })

  // Resolution: a swipe-up on the trigger is also a tap as far as the
  // browser is concerned, so it fires a native 'click' right after
  // pointerup. An unguarded click handler toggles on that click, closing the
  // sheet a moment after the swipe opened it. Holding here (rather than
  // asserting once, immediately after the swipe) is exactly what would catch
  // a fix that opens on pointerup but lets the trailing click close it
  // straight back — a single post-swipe assertion is already true in the
  // instant between the two events, before the click has even fired.
  test('swipe-open leaves the sheet open and it stays open', async ({ page }) => {
    await page.goto('/demo/vanilla')

    await swipeUpOnTrigger(page, 96)

    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
    // Give the browser's synthesized click, and anything reacting to it, a
    // full turn to run, then confirm the sheet is still open rather than
    // toggled shut again.
    await page.waitForTimeout(250)
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')

    // A real click on the trigger afterwards must still close it normally —
    // proves the click suppression is a one-shot consumed by the swipe, not
    // a handler disabled outright.
    await page.locator('[data-tz-trigger]').click()
    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-open', 'true')
  })
})
