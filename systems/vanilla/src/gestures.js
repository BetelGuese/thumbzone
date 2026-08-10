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
 * @param {(offset: number, height: number) => number} deps.dragProgress
 * @param {(gesture: { offset: number, velocity: number, height: number }) => boolean} deps.shouldDismiss
 * @param {() => void} deps.open
 * @param {() => void} deps.close
 * @returns {{ detach: () => void, consumeSwipeClick: () => boolean }}
 */
export function attachGestures({ sheet, trigger, dragProgress, shouldDismiss, open, close }) {
  let drag = null
  let swipeOpened = false

  function beginDrag(event, source) {
    drag = {
      source,
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  // A menu link (or image) is natively draggable in Chromium; once a press
  // on one moves far enough, Chromium commits to its own drag-and-drop
  // gesture and cancels our pointer stream — a 'pointercancel' with
  // clientX/Y zeroed out — instead of ever delivering a pointerup, so
  // shouldDismiss never sees a real offset. WebKit does not do this.
  // Preventing 'dragstart' (it bubbles from the link to the sheet) stops
  // Chromium from ever committing to that native gesture, regardless of
  // what interactive content a consumer's menu contains.
  function preventNativeDrag(event) {
    event.preventDefault()
  }

  function onSheetPointerDown(event) {
    // Let the sheet's own scrollable content win when it is not at the top;
    // otherwise the drag would fight the scroll.
    if (sheet.scrollTop > 0) return
    beginDrag(event, 'sheet')
    sheet.dataset.tzDragging = 'true'
  }

  function onSheetPointerMove(event) {
    if (!drag || drag.source !== 'sheet' || event.pointerId !== drag.pointerId) return
    const offset = Math.max(event.clientY - drag.startY, 0)
    const elapsed = event.timeStamp - drag.lastTime
    if (elapsed > 0) drag.velocity = (event.clientY - drag.lastY) / elapsed
    drag.lastY = event.clientY
    drag.lastTime = event.timeStamp
    sheet.style.transform = `translateY(${dragProgress(offset, sheet.offsetHeight) * 100}%)`
  }

  function onSheetPointerUp(event) {
    if (!drag || drag.source !== 'sheet' || event.pointerId !== drag.pointerId) return
    const offset = Math.max(event.clientY - drag.startY, 0)
    const dismiss = shouldDismiss({ offset, velocity: drag.velocity, height: sheet.offsetHeight })
    drag = null
    delete sheet.dataset.tzDragging
    sheet.style.transform = ''
    if (dismiss) close()
  }

  function onTriggerPointerDown(event) {
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

  sheet.addEventListener('dragstart', preventNativeDrag)
  sheet.addEventListener('pointerdown', onSheetPointerDown)
  sheet.addEventListener('pointermove', onSheetPointerMove)
  sheet.addEventListener('pointerup', onSheetPointerUp)
  sheet.addEventListener('pointercancel', onSheetPointerUp)
  trigger.addEventListener('pointerdown', onTriggerPointerDown)
  trigger.addEventListener('pointerup', onTriggerPointerUp)

  return {
    detach() {
      sheet.removeEventListener('dragstart', preventNativeDrag)
      sheet.removeEventListener('pointerdown', onSheetPointerDown)
      sheet.removeEventListener('pointermove', onSheetPointerMove)
      sheet.removeEventListener('pointerup', onSheetPointerUp)
      sheet.removeEventListener('pointercancel', onSheetPointerUp)
      trigger.removeEventListener('pointerdown', onTriggerPointerDown)
      trigger.removeEventListener('pointerup', onTriggerPointerUp)
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
