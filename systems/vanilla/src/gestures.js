/**
 * Pointer-driven drag-to-dismiss and swipe-to-open for a thumbzone sheet.
 * Split out of thumbzone.js purely to keep that file within its line-count
 * budget as later behaviour lands there; this module has no purpose or
 * lifecycle of its own outside of initThumbzone.
 */

/** Vertical travel (px) on the trigger that counts as a swipe rather than a tap. */
const SWIPE_OPEN_DISTANCE = 24

/**
 * Wires the gestures onto an already-open-capable sheet/trigger pair.
 * @param {object} deps
 * @param {HTMLElement} deps.sheet
 * @param {HTMLElement} deps.trigger
 * @param {HTMLElement} deps.menu
 * @param {(offset: number, height: number) => number} deps.dragProgress
 * @param {(gesture: { offset: number, velocity: number, height: number }) => boolean} deps.shouldDismiss
 * @param {() => { record: (position: number, time: number) => void, velocityAt: (position: number, time: number) => number }} deps.createVelocityTracker
 * @param {() => void} deps.open
 * @param {() => void} deps.close
 * @returns {{ detach: () => void, consumeSwipeClick: () => boolean }}
 */
export function attachGestures({ sheet, trigger, menu, dragProgress, shouldDismiss, createVelocityTracker, open, close }) {
  let drag = null
  let swipeOpened = false

  // Returns whether a drag was actually started, so callers only mark the
  // gesture as in progress (e.g. data-tz-dragging) when it genuinely is.
  function beginDrag(event, source) {
    // setPointerCapture() throws if this pointerId has no real, currently
    // active pointer behind it — rare, but reachable (a stray or malformed
    // event), and used to leave `drag` set regardless (the assignment ran
    // unconditionally, before this check existed) despite capture never
    // actually being held. Committing to a drag only once capture has
    // genuinely succeeded avoids creating that wedge at the source, rather
    // than leaving it to clearStaleDrag() to notice and clean up later.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      return false
    }
    const tracker = createVelocityTracker()
    tracker.record(event.clientY, event.timeStamp)
    drag = { source, pointerId: event.pointerId, startY: event.clientY, tracker, capturedBy: event.currentTarget }
    return true
  }

  // A pointerup or pointercancel that never reaches us — the tab losing
  // focus mid-touch, or any other case the platform doesn't hand us a
  // matching event for — would otherwise leave `drag` set forever: every
  // later pointerdown is unconditionally rejected by the guards below, so
  // the whole gesture surface goes dead until a page reload. The browser's
  // own capture bookkeeping tracks the pointer's real lifecycle independently
  // of whether its event reached us, so a `drag` whose capture has already
  // been released is exactly the abandoned state to recover from — treat it
  // as gone before deciding whether a new pointerdown may proceed.
  function clearStaleDrag() {
    if (!drag || drag.capturedBy.hasPointerCapture(drag.pointerId)) return
    const wasSheetDrag = drag.source === 'sheet'
    drag = null
    if (wasSheetDrag) resetSheetDragVisuals()
  }

  function resetSheetDragVisuals() {
    delete sheet.dataset.tzDragging
    sheet.style.transform = ''
  }

  // A menu link (or image) is natively draggable in Chromium; once a press
  // on one moves far enough, Chromium commits to its own drag-and-drop
  // gesture and cancels our pointer stream — a 'pointercancel' with
  // clientX/Y zeroed out — instead of ever delivering a pointerup, so
  // shouldDismiss never sees a real offset. WebKit does not do this.
  // Preventing 'dragstart' (it bubbles up from the link/image) stops that
  // commitment on both the sheet and the trigger, regardless of what
  // interactive content a consumer's menu or trigger icon contains.
  function preventNativeDrag(event) {
    event.preventDefault()
  }

  function onSheetPointerDown(event) {
    clearStaleDrag()
    // A second finger landing mid-drag would otherwise re-enter beginDrag
    // and silently overwrite the first finger's state; ignore it, and
    // ignore any non-primary pointer (e.g. a secondary touch point) for the
    // same reason. Accidental second touches are common on a bottom sheet
    // operated with a thumb while the rest of the hand rests nearby.
    if (drag || !event.isPrimary) return
    // The menu is its own always-scrollable region (see thumbzone.css); a
    // drag never starts inside it, regardless of scroll position — that is
    // what the menu's own static touch-action actually depends on holding.
    if (menu.contains(event.target)) return
    if (beginDrag(event, 'sheet')) sheet.dataset.tzDragging = 'true'
  }

  function onSheetPointerMove(event) {
    if (!drag || drag.source !== 'sheet' || event.pointerId !== drag.pointerId) return
    const offset = Math.max(event.clientY - drag.startY, 0)
    drag.tracker.record(event.clientY, event.timeStamp)
    // This inline transform outranks the reduced-motion stylesheet rule
    // (`.tz-sheet { transform: none }`) on specificity, so the sheet tracks
    // the finger 1:1 even with prefers-reduced-motion set — deliberately:
    // that preference is about motion the interface imposes on its own,
    // not motion the user is actively driving with a finger. Freezing
    // direct manipulation would read as broken, not calmer. Once the
    // pointer is released, onSheetPointerUp clears this override and hands
    // control back to the stylesheet, whose 240ms/1ms transition duration
    // (per that same media query) governs the spring-back or dismiss
    // animation that follows — that release step honours the preference.
    sheet.style.transform = `translateY(${dragProgress(offset, sheet.offsetHeight) * 100}%)`
  }

  function onSheetPointerUp(event) {
    if (!drag || drag.source !== 'sheet' || event.pointerId !== drag.pointerId) return
    const offset = Math.max(event.clientY - drag.startY, 0)
    const velocity = drag.tracker.velocityAt(event.clientY, event.timeStamp)
    const dismiss = shouldDismiss({ offset, velocity, height: sheet.offsetHeight })
    drag = null
    resetSheetDragVisuals()
    if (dismiss) close()
  }

  function onTriggerPointerDown(event) {
    clearStaleDrag()
    if (drag || !event.isPrimary) return
    beginDrag(event, 'trigger')
  }

  function onTriggerPointerUp(event) {
    if (!drag || drag.source !== 'trigger' || event.pointerId !== drag.pointerId) return
    const travelled = drag.startY - event.clientY
    drag = null
    if (travelled < SWIPE_OPEN_DISTANCE) return
    // The swipe's pointerup is followed by a synthesized 'click' on the same
    // element; flag it so the caller's click handler can consume that one
    // click instead of treating it as a fresh tap and toggling the sheet
    // straight back shut.
    swipeOpened = true
    open()
  }

  // A cancelled gesture is not a completed one: it must never reach
  // shouldDismiss. The spec does not guarantee a cancelled pointer's
  // coordinates — Chromium happens to zero them, which today makes a
  // cancelled drag's offset clamp to 0 and fall through shouldDismiss's own
  // "offset <= 0" guard by coincidence, but an engine that instead retained
  // the last real coordinates would hand shouldDismiss a positive offset
  // and a stale velocity and dismiss a gesture the browser aborted, not one
  // the user released. This handler resets the same drag/visual state
  // pointerup does, but always springs back rather than ever evaluating
  // dismissal, on both the sheet and the trigger (a swipe-open cancelled by
  // the platform must not leave `drag` permanently set either).
  function onPointerCancel(event) {
    if (!drag || event.pointerId !== drag.pointerId) return
    const wasSheetDrag = drag.source === 'sheet'
    drag = null
    if (wasSheetDrag) resetSheetDragVisuals()
  }

  sheet.addEventListener('dragstart', preventNativeDrag)
  trigger.addEventListener('dragstart', preventNativeDrag)
  sheet.addEventListener('pointerdown', onSheetPointerDown)
  sheet.addEventListener('pointermove', onSheetPointerMove)
  sheet.addEventListener('pointerup', onSheetPointerUp)
  sheet.addEventListener('pointercancel', onPointerCancel)
  trigger.addEventListener('pointerdown', onTriggerPointerDown)
  trigger.addEventListener('pointerup', onTriggerPointerUp)
  trigger.addEventListener('pointercancel', onPointerCancel)

  return {
    detach() {
      sheet.removeEventListener('dragstart', preventNativeDrag)
      trigger.removeEventListener('dragstart', preventNativeDrag)
      sheet.removeEventListener('pointerdown', onSheetPointerDown)
      sheet.removeEventListener('pointermove', onSheetPointerMove)
      sheet.removeEventListener('pointerup', onSheetPointerUp)
      sheet.removeEventListener('pointercancel', onPointerCancel)
      trigger.removeEventListener('pointerdown', onTriggerPointerDown)
      trigger.removeEventListener('pointerup', onTriggerPointerUp)
      trigger.removeEventListener('pointercancel', onPointerCancel)
      // A drag mid-flight at teardown time must not leave the DOM mutated
      // behind it — destroy() promises to fully restore the pre-init state,
      // and an inline transform plus a stuck data-tz-dragging (which also
      // disables the sheet's CSS transition) would otherwise survive it.
      // (No inline touch-action to restore here any more — it now comes
      // entirely from the stylesheet, never set inline by this module.)
      drag = null
      resetSheetDragVisuals()
    },
    // Check-and-clear in one step: a second click shortly after a swipe
    // (e.g. a genuine follow-up tap) must be treated as the ordinary tap it
    // is, not silently eaten too.
    consumeSwipeClick() {
      const opened = swipeOpened
      swipeOpened = false
      return opened
    },
  }
}
