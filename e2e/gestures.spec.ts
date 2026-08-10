import { test, expect, type Page, type CDPSession } from '@playwright/test'
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

    await beginDragSheet(page, height * (DISMISS_RATIO - 0.1), SLOW_VELOCITY)
    // A drag that never actually registered (e.g. pointerdown landing off
    // the sheet, or being cancelled outright) would trivially "spring back"
    // too, since nothing would have changed either — assert the drag was
    // real before checking how it resolved.
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-dragging', 'true')
    await page.mouse.up()

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

  // Isolates the JS-level gate specifically, decoupled from the CSS
  // touch-action layer (the real-touch fixture test covers that
  // separately): page.mouse never engages touch-action arbitration at all,
  // so this fails only if onSheetPointerDown itself stops excluding the
  // menu — proving the gate is load-bearing on its own, not merely
  // redundant with the stylesheet.
  test('a mouse drag starting on the menu is never recognised as a dismiss gesture', async ({ page }) => {
    await page.goto('/demo/vanilla-overflow')
    await openSheetAndSettle(page)
    const menuBox = (await page.locator('[data-tz-menu]').boundingBox())!
    const height = (await page.locator('[data-tz-sheet]').boundingBox())!.height

    await page.mouse.move(menuBox.x + menuBox.width / 2, menuBox.y + 20)
    await page.mouse.down()
    for (let i = 1; i <= 12; i += 1) {
      await page.mouse.move(menuBox.x + menuBox.width / 2, menuBox.y + 20 + (height * 0.5 * i) / 12)
      await page.waitForTimeout(20)
    }
    // Never recognised as a drag at all — not even the dragging attribute
    // appears — which is the direct proof that onSheetPointerDown bailed at
    // the menu-containment check, before ever calling beginDrag.
    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-dragging', 'true')
    await page.mouse.up()
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
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

  // Cheap, engine-independent proof that the trigger's own dragstart guard
  // (not just the sheet's) actually intercepts the event: dispatchEvent()
  // returns false when a cancelable event had preventDefault() called on
  // it. A consumer using a natively-draggable <img> icon here, instead of
  // this demo's inline <svg> (which isn't draggable in the first place, so
  // it can't exercise this on its own), would otherwise reintroduce the
  // swipe-to-open cancellation dragstart prevention closes on the sheet.
  test('dragstart on the trigger is prevented', async ({ page }) => {
    await page.goto('/demo/vanilla')

    const notCancelled = await page.locator('[data-tz-trigger]').evaluate((el) =>
      el.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true })),
    )

    expect(notCancelled).toBe(false)
  })

  // A pointerup or pointercancel that never reaches gestures.js — the tab
  // losing focus mid-touch, or any other case the platform doesn't hand us
  // a matching event for — must not wedge every future gesture: since the
  // second-pointer guard added for a different finding rejects any
  // pointerdown while `drag` is set, a `drag` left behind by a vanished
  // gesture would otherwise block every subsequent one forever.
  //
  // A real page.mouse gesture cannot reproduce "capture lost, no matching
  // event" directly: releasePointerCapture() fires only
  // 'lostpointercapture', but a held mouse button still implicitly
  // redelivers its eventual mouseup to the original pointerdown target
  // regardless (verified directly — moving the pointer away and releasing
  // there still reaches the sheet's own listener, completing the drag via
  // the ordinary path and never engaging this safety net at all). A
  // pointerdown whose pointerId was never backed by a real, active pointer
  // is the reliable proxy instead: setPointerCapture() throws
  // NotFoundError for it on both engines (verified directly), so
  // hasPointerCapture() is false from the very start — exactly the
  // condition clearStaleDrag() checks for, and the closest reachable stand-in
  // for "capture is gone and nothing ever told us."
  test('a drag whose capture never actually succeeded does not wedge future gestures', async ({ page }) => {
    await page.goto('/demo/vanilla')
    await openSheetAndSettle(page)
    const box = (await page.locator('[data-tz-sheet]').boundingBox())!

    await page.locator('[data-tz-sheet]').evaluate((el, y) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 999, isPrimary: true, clientY: y, bubbles: true }))
    }, box.y + 10)

    // A brand-new, real gesture must still be recognized, not silently
    // swallowed by the abandoned state left behind above.
    const startX = box.x + box.width / 2
    const startY = box.y + 10
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX, startY + 30)
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-dragging', 'true')
    await page.mouse.up()
  })
})

// prefers-reduced-motion turns the sheet's open/close animation into an
// opacity cross-fade with no transform change at all — but a drag is direct
// manipulation, not an animation the interface imposes on its own, so it
// must still track the finger 1:1 regardless of that preference. This
// checks both halves: the drag itself is unaffected, and the *release* that
// follows genuinely honours the preference rather than merely not fighting
// it during the drag.
test.describe('reduced motion', () => {
  test('a drag still tracks the finger directly, and the release honours the preference once let go', async ({
    page,
  }) => {
    // test.use({ reducedMotion: 'reduce' }) does not reliably take effect
    // against this project's webServer-launched, device-emulated contexts
    // in this Playwright version — emulateMedia() called directly does, and
    // is verified below via matchMedia before relying on it for the rest of
    // the test.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/demo/vanilla')
    // Guards the emulation itself: if it silently stopped taking effect,
    // the assertions below would otherwise fail confusingly further down.
    expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await page.locator('[data-tz-trigger]').click()
    // Under reduced motion the sheet only animates opacity, never position
    // (transform stays 'none' throughout), so there is no transform
    // transition to await here — unlike openSheetAndSettle's normal-motion
    // helper, which specifically waits on one.
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')

    const height = (await page.locator('[data-tz-sheet]').boundingBox())!.height
    await beginDragSheet(page, height * 0.1, SLOW_VELOCITY)

    const transformDuringDrag = await page
      .locator('[data-tz-sheet]')
      .evaluate((el) => (el as HTMLElement).style.transform)
    expect(transformDuringDrag).not.toBe('')

    await page.mouse.up()

    // The stylesheet's own reduced-motion media query collapses the
    // transition duration to 1ms — this is what actually makes the
    // spring-back/dismiss animation that follows honour the preference.
    const transitionDuration = await page
      .locator('[data-tz-sheet]')
      .evaluate((el) => getComputedStyle(el).transitionDuration)
    expect(transitionDuration).toBe('0.001s')
  })
})

// Pins the touch-action contract that fixes the deadlock: a single
// scroll-and-drag element cannot let native scrolling win only while
// resting at the top and not fight a downward dismiss (no engine supports
// direction-scoped touch-action reliably — verified directly: WebKit
// silently drops pan-up/pan-down to 'auto' rather than honouring them,
// while Chromium does support them), so the menu is a separate region with
// *static*, scroll-position-independent touch-action: it must permit
// vertical panning both before and after scrolling away from the top,
// never toggling back to something that would re-deadlock it. This is an
// adapted, statically-correct version of "does the value change when
// scrollTop changes" — this implementation deliberately never changes it,
// which is the fix, not a state machine to toggle.
test.describe('touch-action contract (engine-independent)', () => {
  test('the handle blocks native panning; the menu always permits it, before and after scrolling', async ({ page }) => {
    await page.goto('/demo/vanilla-overflow')
    await openSheetAndSettle(page)

    const handleTouchAction = await page.locator('[data-tz-handle]').evaluate((el) => getComputedStyle(el).touchAction)
    expect(handleTouchAction).not.toContain('pan-y')

    const menu = page.locator('[data-tz-menu]')
    const touchActionBeforeScroll = await menu.evaluate((el) => getComputedStyle(el).touchAction)
    expect(touchActionBeforeScroll).toContain('pan-y')

    // The deadlock this closes was specifically "touch-action depended on
    // scrollTop, and scrollTop could never move because of it" — so the
    // direct regression check is that moving scrollTop away from 0 must
    // *not* change the value back to something that would block panning.
    // Dispatches 'scroll' explicitly and synchronously in the same
    // evaluate() call, rather than relying on the browser's own async
    // timing for the event that setting scrollTop schedules, so any
    // listener reacting to it (this implementation has none left, by
    // design, but a regression could reintroduce one) is guaranteed to
    // have already run before the check below.
    await menu.evaluate((el) => {
      el.scrollTop = 200
      el.dispatchEvent(new Event('scroll'))
    })
    expect(await menu.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    const touchActionAfterScroll = await menu.evaluate((el) => getComputedStyle(el).touchAction)
    expect(touchActionAfterScroll).toBe(touchActionBeforeScroll)
  })
})

/**
 * Drives a real touch sequence via the Chrome DevTools Protocol rather than
 * page.mouse. This is the one mechanism available through Playwright that
 * exercises a browser's actual touch-action/scroll-arbitration pipeline —
 * page.mouse produces pointer events with pointerType 'mouse' even under
 * hasTouch, which never engages that pipeline at all, and page.touchscreen
 * only supports tap(), not a drag. CDP sessions are a Chromium-only
 * capability; there is no equivalent available for WebKit through
 * Playwright, which is why this file's real-touch coverage is
 * mobile-chrome-only (see the skip below).
 */
async function cdpTouchDrag(client: CDPSession, x: number, startY: number, distance: number, steps = 12) {
  const touchPoint = (y: number) => [{ x, y, radiusX: 11, radiusY: 11, id: 0 }]
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoint(startY) })
  for (let i = 1; i <= steps; i += 1) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoint(startY + (distance * i) / steps) })
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

// Real touch input goes through a browser's native touch-action/scroll
// arbitration before our own pointer listeners ever see it — a mechanism
// none of the mouse-driven tests above exercise at all. Confirmed directly
// (throwaway CDP scripts, not committed) that, before the touch-action
// handling in gestures.js existed, both of the gestures below got cancelled
// by the browser's own scroll takeover after only a few touchmove samples:
// a real touch pan is read as "the user wants to scroll", and the pointer
// stream is cancelled before our code ever sees a full gesture — reachable
// even starting on plain, non-interactive sheet content, so it is a
// distinct bug from the native-link-drag cancellation dragstart prevention
// fixes.
test.describe('real touch input (Chromium only, via CDP)', () => {
  test('drag-to-dismiss survives real touch-action arbitration on the sheet', async ({ page, context, browserName }) => {
    test.skip(
      browserName !== 'chromium',
      'No CDP (or equivalent) touch-drag simulation is available for WebKit through Playwright; ' +
        'page.mouse does not exercise real touch-action arbitration on any engine.',
    )
    await page.goto('/demo/vanilla')
    await openSheetAndSettle(page)
    const box = (await page.locator('[data-tz-sheet]').boundingBox())!
    const height = box.height

    const client = await context.newCDPSession(page)
    // Starting on the sheet's own background, not a link — this exercises
    // the scroll-arbitration bug specifically, independently of the
    // separate native-link-drag one dragstart prevention fixes.
    await cdpTouchDrag(client, box.x + box.width / 2, box.y + 5, height * (DISMISS_RATIO + 0.2))

    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-open', 'true')
  })

  test('swipe-to-open survives real touch-action arbitration on the trigger', async ({ page, context, browserName }) => {
    test.skip(
      browserName !== 'chromium',
      'No CDP (or equivalent) touch-drag simulation is available for WebKit through Playwright; ' +
        'page.mouse does not exercise real touch-action arbitration on any engine.',
    )
    await page.goto('/demo/vanilla')
    const box = (await page.locator('[data-tz-trigger]').boundingBox())!

    const client = await context.newCDPSession(page)
    await cdpTouchDrag(client, box.x + box.width / 2, box.y + box.height / 2, -96)

    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
  })

  // The deadlock this whole round exists to close: a menu taller than the
  // sheet must still scroll under a real touch, not just under page.mouse
  // (which never engages the arbitration pipeline the bug lived in at all).
  // Uses the dedicated overflow fixture (see thumbzone.css's comment on
  // .tz-menu for why a fixture route rather than a query param).
  test('a menu taller than the sheet scrolls by real touch instead of deadlocking at the top', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'No CDP (or equivalent) touch-drag simulation is available for WebKit through Playwright; ' +
        'page.mouse does not exercise real touch-action arbitration on any engine.',
    )
    await page.goto('/demo/vanilla-overflow')
    await openSheetAndSettle(page)
    const menuBox = (await page.locator('[data-tz-menu]').boundingBox())!

    const client = await context.newCDPSession(page)
    // Upward: revealing content below, exactly the direction the old
    // scrollTop-gated touch-action: none blocked forever once at the top.
    await cdpTouchDrag(client, menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2, -300)

    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
    const scrollTop = await page.locator('[data-tz-menu]').evaluate((el) => el.scrollTop)
    expect(scrollTop).toBeGreaterThan(0)
  })

  // The necessary trade-off of the fix above: drag-to-dismiss can only ever
  // be recognised from the sheet's own chrome (the handle) now, never from
  // inside the always-scrollable menu — otherwise the two would still be
  // contesting the same touch the way the original bug report described.
  test('a downward drag starting on the menu does not dismiss, unlike one on the handle', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'No CDP (or equivalent) touch-drag simulation is available for WebKit through Playwright; ' +
        'page.mouse does not exercise real touch-action arbitration on any engine.',
    )
    await page.goto('/demo/vanilla-overflow')
    await openSheetAndSettle(page)
    const menuBox = (await page.locator('[data-tz-menu]').boundingBox())!
    const height = (await page.locator('[data-tz-sheet]').boundingBox())!.height

    const client = await context.newCDPSession(page)
    await cdpTouchDrag(client, menuBox.x + menuBox.width / 2, menuBox.y + 20, height * (DISMISS_RATIO + 0.2))

    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
  })
})
