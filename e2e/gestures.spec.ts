import { test, expect } from '@playwright/test'
// The dismiss threshold comes from the normative implementation: a port that
// retuned it would no longer be the same interaction, so every system's
// gestures are measured against the one ratio.
import { DISMISS_RATIO } from '../systems/vanilla/src/thumbzone.js'
import { FAST_VELOCITY, SLOW_VELOCITY, beginDragSheet, dragSheet, swipeUpOnTrigger } from './support/drag'
import { destroyThumbzone, reinitThumbzone } from './support/handles'
import { openSheetAndSettle } from './support/sheet'
import { describeForEachSystem, describeOverflowFixture } from './support/systems'
import { cdpTouchDrag, skipWithoutRealTouch } from './support/touch'

describeForEachSystem('gestures', (system) => {
  test('dismisses when dragged past the threshold', async ({ page }) => {
    await page.goto(system.route)
    await openSheetAndSettle(page)
    const height = (await page.locator('[data-tz-sheet]').boundingBox())!.height

    await dragSheet(page, height * (DISMISS_RATIO + 0.2), SLOW_VELOCITY)

    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-open', 'true')
  })

  test('springs back when the drag stops short', async ({ page }) => {
    await page.goto(system.route)
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

  // The two tests above never drive the drag fast enough to reach the fling
  // velocity, so neither one proves the velocity-based half of the dismiss
  // decision is actually wired up on the sheet — only the distance half is. A
  // short but fast drag, comfortably under DISMISS_RATIO by distance alone,
  // isolates that other path.
  test('dismisses on a fast fling that never reaches the distance threshold', async ({ page }) => {
    await page.goto(system.route)
    await openSheetAndSettle(page)
    const height = (await page.locator('[data-tz-sheet]').boundingBox())!.height

    await dragSheet(page, height * (DISMISS_RATIO - 0.1), FAST_VELOCITY, 4)

    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-open', 'true')
  })

  test('marks the sheet as dragging only while a drag is in progress', async ({ page }) => {
    await page.goto(system.route)
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

  // A cancelled gesture must never reach the dismiss decision. Chromium
  // happens to zero a pointercancel's coordinates, which today makes a
  // cancelled drag's offset clamp to 0 and fall through the "offset <= 0"
  // guard by coincidence — but the spec does not require that, and an engine
  // that instead retained the last real coordinates would hand the decision a
  // positive offset and dismiss a gesture the platform aborted, not one the
  // user released. Dispatching the cancel synthetically with a deliberately
  // large clientY (playing the part of that hypothetical engine) proves the
  // handler ignores the cancel event's own coordinates altogether, rather
  // than merely happening to survive Chromium's specific zeroing.
  test('a cancelled drag springs back regardless of the cancel event\'s own coordinates', async ({ page }) => {
    await page.goto(system.route)
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
  // silently overwrite the first finger's drag state, and the first finger's
  // eventual pointerup would then be discarded on the pointerId mismatch —
  // leaving data-tz-dragging and the inline transform (and the CSS transition
  // they disable) stuck until some later drag happened to clear them.
  test('a second pointer landing mid-drag does not hijack or corrupt the gesture', async ({ page }) => {
    await page.goto(system.route)
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
  // drag happened to clear it).
  test('destroy() mid-drag leaves no dragging state or inline transform behind', async ({ page }) => {
    await page.goto(system.route)
    await openSheetAndSettle(page)
    const height = (await page.locator('[data-tz-sheet]').boundingBox())!.height

    await beginDragSheet(page, height * (DISMISS_RATIO - 0.1), SLOW_VELOCITY)
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-dragging', 'true')
    const transformDuringDrag = await page.locator('[data-tz-sheet]').evaluate((el) => (el as HTMLElement).style.transform)
    expect(transformDuringDrag).not.toBe('')

    await destroyThumbzone(page)

    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-dragging', 'true')
    const transformAfterDestroy = await page.locator('[data-tz-sheet]').evaluate((el) => (el as HTMLElement).style.transform)
    expect(transformAfterDestroy).toBe('')

    // The pointer is still physically "down" as far as the OS/browser is
    // concerned; release it so later tests in the same worker don't start
    // with a stuck mouse button.
    await page.mouse.up()
  })

  // The test above never distinguishes "cleared to empty" from "restored to
  // whatever was there before", because the page's own inline transform was
  // already empty at init time — both would look identical. A consumer's
  // own pre-init inline transform (unrelated to thumbzone entirely) must
  // still be there after destroy(), not silently discarded in favour of an
  // empty string.
  test('destroy() restores a pre-init inline transform instead of clearing it', async ({ page }) => {
    await page.goto(system.route)
    await destroyThumbzone(page)

    const customTransform = 'translateX(3px)'
    await page.locator('[data-tz-sheet]').evaluate((el, value) => {
      ;(el as HTMLElement).style.transform = value
    }, customTransform)

    await reinitThumbzone(page)
    // Guards the premise itself: the gesture layer must capture the inline
    // value at that init call, and nothing since must have touched it.
    const transformAtInit = await page.locator('[data-tz-sheet]').evaluate((el) => (el as HTMLElement).style.transform)
    expect(transformAtInit, 'setup did not leave the expected pre-init inline transform in place').toBe(customTransform)

    // Open, drag, and let it spring back — exercising the normal
    // clear-to-'' path mid-lifecycle, which must still hand control to the
    // stylesheet during active use, before destroy() at the end restores
    // the original custom value rather than that intermediate ''.
    await openSheetAndSettle(page)
    const height = (await page.locator('[data-tz-sheet]').boundingBox())!.height
    await dragSheet(page, height * (DISMISS_RATIO - 0.1), SLOW_VELOCITY)
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')

    await destroyThumbzone(page)

    const transformAfterDestroy = await page.locator('[data-tz-sheet]').evaluate((el) => (el as HTMLElement).style.transform)
    expect(transformAfterDestroy).toBe(customTransform)
  })

  test('opens on a swipe up from the trigger', async ({ page }) => {
    await page.goto(system.route)

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
    await page.goto(system.route)
    await page.locator('[data-tz-trigger]').click()
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')

    await swipeUpOnTrigger(page, 96)

    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
  })

  // A swipe-up on the trigger is also a tap as far as the browser is
  // concerned, so it fires a native 'click' right after pointerup. An
  // unguarded click handler toggles on that click, closing the sheet a moment
  // after the swipe opened it. Holding here (rather than asserting once,
  // immediately after the swipe) is exactly what would catch an
  // implementation that opens on pointerup but lets the trailing click close
  // it straight back — a single post-swipe assertion is already true in the
  // instant between the two events, before the click has even fired.
  test('swipe-open leaves the sheet open and it stays open', async ({ page }) => {
    await page.goto(system.route)

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
    await page.goto(system.route)

    const notCancelled = await page.locator('[data-tz-trigger]').evaluate((el) =>
      el.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true })),
    )

    expect(notCancelled).toBe(false)
  })

  // setPointerCapture() throws when a pointerId has no real, currently
  // active pointer behind it (a stray or malformed event) — reachable via a
  // pointerdown whose pointerId was never backed by anything real, which
  // throws NotFoundError on both engines (verified directly). This must not
  // surface as an uncaught error in the page (test output has to stay
  // pristine), and must not leave any state behind that blocks the next,
  // genuine gesture.
  test('a pointerdown whose capture cannot succeed neither throws uncaught nor blocks a later gesture', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.goto(system.route)
    await openSheetAndSettle(page)
    const box = (await page.locator('[data-tz-sheet]').boundingBox())!

    await page.locator('[data-tz-sheet]').evaluate((el, y) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 999, isPrimary: true, clientY: y, bubbles: true }))
    }, box.y + 10)

    expect(pageErrors).toEqual([])
    // Never treated as a drag in progress either — a drag is only committed
    // to once capture has actually succeeded.
    await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-dragging', 'true')

    // A brand-new, real gesture afterwards must still be recognized.
    const startX = box.x + box.width / 2
    const startY = box.y + 10
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX, startY + 30)
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-dragging', 'true')
    await page.mouse.up()
  })

  // A drag whose capture has been released without a matching
  // pointerup/pointercancel ever telling the implementation (the tab losing
  // focus mid-touch, or any other case the platform doesn't hand us a
  // matching event for) must not block every future gesture forever, since
  // the second-pointer guard above otherwise rejects any pointerdown while a
  // drag is live.
  //
  // A real page.mouse or CDP-touch gesture cannot reproduce "capture lost,
  // no matching event" by ending the gesture elsewhere: verified directly
  // that a held mouse button redelivers its eventual mouseup to the
  // original pointerdown target regardless of an explicit
  // releasePointerCapture() call, and that real touch does the same — a
  // touch's terminal event targets wherever it started for its entire
  // lifetime, independent of Pointer Capture, which only retargets *other*
  // elements' claim on it. The reliable proxy instead: release capture
  // explicitly (this part is real — hasPointerCapture() becomes false), then
  // dispatch a synthetic pointerdown reusing the *same* pointerId while the
  // real pointer is still down underneath it (so setPointerCapture can
  // succeed again for a fresh drag). Whether the sheet's own capture for
  // that pointerId reads true afterward is the direct, unambiguous signal
  // that the stale drag was cleared and replaced with a new one — not just
  // that dragging happened to still read "true" throughout, which would be
  // true regardless of whether the guard did anything.
  test('a drag whose capture was silently released without a matching pointerup can be superseded', async ({
    page,
  }) => {
    await page.goto(system.route)
    await openSheetAndSettle(page)
    const box = (await page.locator('[data-tz-sheet]').boundingBox())!
    const startX = box.x + box.width / 2
    const startY = box.y + 10

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX, startY + 30)
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-dragging', 'true')

    await page.locator('[data-tz-sheet]').evaluate((el) => el.releasePointerCapture(1))
    expect(await page.locator('[data-tz-sheet]').evaluate((el) => el.hasPointerCapture(1))).toBe(false)

    const hasCaptureAfterSupersede = await page.locator('[data-tz-sheet]').evaluate((el, y) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, isPrimary: true, clientY: y, bubbles: true }))
      return el.hasPointerCapture(1)
    }, startY + 5)
    expect(hasCaptureAfterSupersede).toBe(true)

    // The real mouse button is still physically down as far as the OS is
    // concerned; release it so later tests in the same worker don't start
    // with a stuck button.
    await page.mouse.up()
  })

  // Isolates the JS-level gate specifically, decoupled from the CSS
  // touch-action layer (the real-touch fixture test covers that
  // separately): page.mouse never engages touch-action arbitration at all,
  // so this fails only if the pointerdown handler itself stops excluding the
  // menu — proving the gate is load-bearing on its own, not merely
  // redundant with the stylesheet. Needs the tall menu: on a short one, a
  // drag starting inside it would have nowhere to travel.
  describeOverflowFixture(system, 'overflowing menu', (overflowRoute) => {
    test('a mouse drag starting on the menu is never recognised as a dismiss gesture', async ({ page }) => {
      await page.goto(overflowRoute)
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
      // appears — which is the direct proof that the handler bailed at the
      // menu-containment check, before ever beginning a drag.
      await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-dragging', 'true')
      await page.mouse.up()
      await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
    })
  })
})

// prefers-reduced-motion turns the sheet's open/close animation into an
// opacity cross-fade with no transform change at all — but a drag is direct
// manipulation, not an animation the interface imposes on its own, so it
// must still track the finger 1:1 regardless of that preference. This
// checks both halves: the drag itself is unaffected, and the *release* that
// follows genuinely honours the preference rather than merely not fighting
// it during the drag.
describeForEachSystem('reduced motion', (system) => {
  test('a drag still tracks the finger directly, and the release honours the preference once let go', async ({
    page,
  }) => {
    // test.use({ reducedMotion: 'reduce' }) does not reliably take effect
    // against this project's webServer-launched, device-emulated contexts
    // in this Playwright version — emulateMedia() called directly does, and
    // is verified below via matchMedia before relying on it for the rest of
    // the test.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(system.route)
    // Guards the emulation itself: if it silently stopped taking effect,
    // the assertions below would otherwise fail confusingly further down.
    expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await page.locator('[data-tz-trigger]').click()
    // Under reduced motion the sheet only animates opacity, never position
    // (transform stays 'none' throughout), so there is no transform
    // transition to await here — unlike openSheetAndSettle, which
    // specifically waits on one.
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
// scrollTop changes" — the contract deliberately never changes it, which is
// the fix, not a state machine to toggle.
describeForEachSystem('touch-action contract (engine-independent)', (system) => {
  describeOverflowFixture(system, 'overflowing menu', (overflowRoute) => {
    test('the handle blocks native panning; the menu always permits it, before and after scrolling', async ({ page }) => {
      await page.goto(overflowRoute)
      await openSheetAndSettle(page)

      // Exact computed values, not a substring check: 'auto' (the default a
      // missing declaration falls back to), 'none', and 'manipulation' would
      // all equally satisfy "does not contain 'pan-y'" without actually
      // blocking panning the way 'pinch-zoom' does — a missing declaration on
      // the handle itself previously passed this exact check while leaving
      // panning on the handle entirely unblocked on its own computed style
      // (the ancestor sheet's touch-action doesn't inherit into it).
      const handleTouchAction = await page.locator('[data-tz-handle]').evaluate((el) => getComputedStyle(el).touchAction)
      expect(handleTouchAction).toBe('pinch-zoom')

      const menu = page.locator('[data-tz-menu]')
      const touchActionBeforeScroll = await menu.evaluate((el) => getComputedStyle(el).touchAction)
      expect(touchActionBeforeScroll).toBe('pan-y pinch-zoom')

      // The deadlock this closes was specifically "touch-action depended on
      // scrollTop, and scrollTop could never move because of it" — so the
      // direct regression check is that moving scrollTop away from 0 must
      // *not* change the value back to something that would block panning.
      // Dispatches 'scroll' explicitly and synchronously in the same
      // evaluate() call, rather than relying on the browser's own async
      // timing for the event that setting scrollTop schedules, so any
      // listener reacting to it (the vanilla implementation has none left, by
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

  // The scrim has no scroll of its own, but sits over the page behind it;
  // without its own touch-action, a pan starting there could still scroll
  // that page (see the real-touch test in the CDP block below, which
  // proves the actual page-scroll consequence rather than just the
  // declared value).
  test('the scrim blocks native panning', async ({ page }) => {
    await page.goto(system.route)
    await openSheetAndSettle(page)

    const scrimTouchAction = await page.locator('[data-tz-scrim]').evaluate((el) => getComputedStyle(el).touchAction)
    expect(scrimTouchAction).toBe('pinch-zoom')
  })
})

// Real touch input goes through a browser's native touch-action/scroll
// arbitration before our own pointer listeners ever see it — a mechanism
// none of the mouse-driven tests above exercise at all. Confirmed directly
// (throwaway CDP scripts, not committed) that, before the touch-action
// handling existed, both of the first two gestures below got cancelled by the
// browser's own scroll takeover after only a few touchmove samples: a real
// touch pan is read as "the user wants to scroll", and the pointer stream is
// cancelled before our code ever sees a full gesture — reachable even
// starting on plain, non-interactive sheet content, so it is a distinct bug
// from the native-link-drag cancellation dragstart prevention fixes.
describeForEachSystem('real touch input (Chromium only, via CDP)', (system) => {
  test('drag-to-dismiss survives real touch-action arbitration on the sheet', async ({ page, context, browserName }) => {
    skipWithoutRealTouch(browserName)
    await page.goto(system.route)
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
    skipWithoutRealTouch(browserName)
    await page.goto(system.route)
    const box = (await page.locator('[data-tz-trigger]').boundingBox())!

    const client = await context.newCDPSession(page)
    await cdpTouchDrag(client, box.x + box.width / 2, box.y + box.height / 2, -96)

    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
  })

  // The scrim has no scroll of its own but sits, visually, over the page
  // behind it; touch-action arbitration follows the DOM ancestor chain, not
  // z-index, so without its own touch-action a pan starting on the scrim
  // could still scroll that page underneath despite the scrim's
  // pointer-events blocking taps from reaching it.
  test('a real touch pan on the scrim does not scroll the page behind it', async ({ page, context, browserName }) => {
    skipWithoutRealTouch(browserName)
    await page.goto(system.route)
    await openSheetAndSettle(page)
    const scrollBefore = await page.evaluate(() => document.scrollingElement!.scrollTop)

    // The scrim covers the full viewport, but the open sheet — taller
    // z-index, and easily over half the viewport height on a real device —
    // visually overlaps its own lower portion. A touch there would land on
    // the sheet, not the scrim, and prove nothing about the scrim's own
    // touch-action (confirmed directly: that exact mistake reported this
    // test's target as the sheet and passed regardless of whether the
    // scrim had a touch-action of its own at all). Well above the sheet's
    // top edge is the part of the scrim a touch can actually reach.
    const scrimBox = (await page.locator('[data-tz-scrim]').boundingBox())!
    const sheetBox = (await page.locator('[data-tz-sheet]').boundingBox())!
    const startY = sheetBox.y / 2
    const client = await context.newCDPSession(page)
    const touchTarget = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.getAttribute('data-tz-scrim') !== null,
      [scrimBox.x + scrimBox.width / 2, startY],
    )
    expect(touchTarget).toBe(true)
    await cdpTouchDrag(client, scrimBox.x + scrimBox.width / 2, startY, -300)

    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(scrollBefore)
  })

  describeOverflowFixture(system, 'overflowing menu', (overflowRoute) => {
    // The deadlock this whole contract exists to close: a menu taller than
    // the sheet must still scroll under a real touch, not just under
    // page.mouse (which never engages the arbitration pipeline the bug lived
    // in at all).
    test('a menu taller than the sheet scrolls by real touch instead of deadlocking at the top', async ({
      page,
      context,
      browserName,
    }) => {
      skipWithoutRealTouch(browserName)
      await page.goto(overflowRoute)
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
      skipWithoutRealTouch(browserName)
      await page.goto(overflowRoute)
      await openSheetAndSettle(page)
      const menuBox = (await page.locator('[data-tz-menu]').boundingBox())!
      const height = (await page.locator('[data-tz-sheet]').boundingBox())!.height

      const client = await context.newCDPSession(page)
      await cdpTouchDrag(client, menuBox.x + menuBox.width / 2, menuBox.y + 20, height * (DISMISS_RATIO + 0.2))

      await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
    })

    // Neither test above actually drags the *handle* on this fixture — one
    // scrolls the menu, the other confirms the menu alone can't dismiss.
    // Proves both halves of the trade-off hold together, in one session: an
    // overflowing menu that has already been scrolled by real touch still
    // dismisses normally from the handle, on the same page.
    test('the handle still dismisses by real touch after the overflowing menu has been scrolled', async ({
      page,
      context,
      browserName,
    }) => {
      skipWithoutRealTouch(browserName)
      await page.goto(overflowRoute)
      await openSheetAndSettle(page)
      const menuBox = (await page.locator('[data-tz-menu]').boundingBox())!
      const handleBox = (await page.locator('[data-tz-handle]').boundingBox())!
      const height = (await page.locator('[data-tz-sheet]').boundingBox())!.height

      const client = await context.newCDPSession(page)
      await cdpTouchDrag(client, menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2, -300)
      expect(await page.locator('[data-tz-menu]').evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
      await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')

      await cdpTouchDrag(client, handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2, height * (DISMISS_RATIO + 0.2))

      await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-open', 'true')
    })
  })
})
