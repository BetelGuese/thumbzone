/**
 * Pointer-driven drag-to-dismiss and swipe-to-open for the Material UI port.
 *
 * Split out of `thumbzone.ts` for the same reason the reference splits its own
 * `gestures.js` out: that module owns the lifecycle — open, close, focus,
 * `inert`, the menu order, teardown — and stays readable only if the gesture
 * engine lives beside it rather than inside it. This has no purpose or lifecycle
 * of its own outside `initThumbzone`, which is its only caller.
 *
 * Every tuned value and every piece of arithmetic comes from `core`, the
 * system-agnostic module the reference implementation and every port both build
 * on. That is what makes the gesture *feel* identical across design systems
 * without any port reimplementing it — and why nothing here compares a distance
 * against a threshold or divides a delta by a duration of its own.
 */

import { SWIPE_OPEN_DISTANCE, createVelocityTracker, dragProgress, shouldDismiss } from '../../../core/index.js'

/**
 * A gesture in flight.
 *
 * `source` is what the pointer went down on, and it is what every later event is
 * matched against: a drag on the sheet and a swipe on the trigger are different
 * gestures with different outcomes, and only one of them can be live at a time.
 * `capturedBy` is the element holding the pointer capture, which is how an
 * abandoned drag is recognised — see `clearStaleDrag`.
 */
interface Drag {
  source: 'sheet' | 'trigger'
  pointerId: number
  startY: number
  tracker: ReturnType<typeof createVelocityTracker>
  capturedBy: HTMLElement
}

/** What `attachGestures` hands back to the lifecycle that owns it. */
export interface GestureHandle {
  /**
   * Removes every listener and leaves no gesture state on the DOM.
   *
   * The inline `transform` is deliberately *not* restored here: the sheet's
   * pre-init inline value is the lifecycle's to capture and hand back, and it
   * does so straight after calling this.
   */
  detach: () => void
  /**
   * Whether the click about to be handled is the one the browser synthesized
   * from a recognised swipe-open. Check-and-clear in one step, so a genuine
   * follow-up tap is the ordinary tap it is rather than a second click to eat.
   */
  consumeSwipeClick: () => boolean
}

/**
 * Wires the gestures over an already-open-capable sheet and trigger.
 *
 * @param deps The sheet, the trigger, the menu a drag may never start inside,
 *   and the lifecycle's own `open`/`close`.
 */
export function attachGestures({
  sheet,
  trigger,
  menu,
  open,
  close,
}: {
  sheet: HTMLElement
  trigger: HTMLElement
  menu: HTMLElement
  open: () => void
  close: () => void
}): GestureHandle {
  let drag: Drag | null = null
  // Set by a recognised swipe-open so the `click` the browser synthesizes from
  // the very same gesture can be consumed once, instead of being read as a fresh
  // tap that toggles the sheet straight back shut.
  let swipeOpened = false

  // Returns whether a drag was actually started, so a caller only marks the
  // gesture in progress when it genuinely is.
  //
  // setPointerCapture() throws NotFoundError if this pointerId has no real,
  // currently active pointer behind it — rare, but reachable through a stray or
  // malformed event. Committing to a drag only once capture has genuinely
  // succeeded keeps `drag` from being set while no capture is held, which every
  // guard below would then honour until clearStaleDrag() happened to notice.
  function beginDrag(target: HTMLElement, event: PointerEvent, source: Drag['source']): boolean {
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      return false
    }
    const tracker = createVelocityTracker()
    tracker.record(event.clientY, event.timeStamp)
    drag = { source, pointerId: event.pointerId, startY: event.clientY, tracker, capturedBy: target }
    return true
  }

  function resetDragVisuals(): void {
    delete sheet.dataset.tzDragging
    // Cleared, not restored to the authored value: mid-lifecycle this hands
    // control back to the style rule that animates open and closed, which is
    // what performs the spring-back or the dismiss. Teardown is the one place
    // that puts the authored value back instead, and it does that itself.
    sheet.style.transform = ''
  }

  // A pointerup or pointercancel that never reaches us — the tab losing focus
  // mid-touch, or any other case the platform hands us no matching event for —
  // would otherwise leave `drag` set forever, and every later pointerdown is
  // unconditionally rejected while a drag is live: the whole gesture surface
  // would go dead until a reload. The browser's own capture bookkeeping tracks
  // the pointer's real lifecycle whether or not its events reached us, so a
  // `drag` whose capture has already been released is exactly the abandoned
  // state to recover from.
  function clearStaleDrag(): void {
    if (!drag || drag.capturedBy.hasPointerCapture(drag.pointerId)) return
    const wasSheetDrag = drag.source === 'sheet'
    drag = null
    if (wasSheetDrag) resetDragVisuals()
  }

  // A menu link (or an image in a trigger's icon) is natively draggable in
  // Chromium; once a press on one moves far enough, Chromium commits to its own
  // drag-and-drop gesture and cancels our pointer stream — a 'pointercancel'
  // with the coordinates zeroed — instead of ever delivering a pointerup, so the
  // release is never evaluated at all. WebKit does not do this. Preventing
  // 'dragstart' (it bubbles up from the link or image) stops that commitment on
  // the sheet and the trigger alike, whatever content a consumer puts in either.
  function preventNativeDrag(event: Event): void {
    event.preventDefault()
  }

  function onSheetPointerDown(event: PointerEvent): void {
    clearStaleDrag()
    // A second finger landing mid-drag would otherwise re-enter beginDrag and
    // silently overwrite the first finger's start position, so the first finger's
    // own release would be measured against the interloper's — and a gesture
    // deliberately stopped short would dismiss anyway. Non-primary pointers are
    // ignored for the same reason: an accidental second touch is common on a
    // bottom sheet worked with a thumb while the hand rests nearby.
    if (drag || !event.isPrimary) return
    // The menu is the sheet's own scroll container and stays pannable by touch at
    // every scroll position, so a drag never starts inside it regardless of where
    // it happens to be scrolled — which leaves the handle, authored as the menu's
    // sibling above it, as the one surface a dismiss drag can begin on. That is
    // what the menu's static touch-action actually depends on holding.
    if (event.target instanceof Node && menu.contains(event.target)) return
    if (beginDrag(sheet, event, 'sheet')) sheet.dataset.tzDragging = 'true'
  }

  function onSheetPointerMove(event: PointerEvent): void {
    if (!drag || drag.source !== 'sheet' || event.pointerId !== drag.pointerId) return
    const offset = Math.max(event.clientY - drag.startY, 0)
    drag.tracker.record(event.clientY, event.timeStamp)
    // This inline transform outranks the sheet's own reduced-motion rule
    // (`transform: none`) on specificity, so the sheet tracks the finger 1:1 even
    // under the preference — deliberately: the preference is about motion the
    // interface imposes on its own, not motion the user is driving with a finger,
    // and freezing direct manipulation would read as broken rather than calmer.
    // The release below clears the override and hands the settle back to the
    // stylesheet, whose transitions the preference does collapse.
    sheet.style.transform = `translateY(${dragProgress(offset, sheet.offsetHeight) * 100}%)`
  }

  function onSheetPointerUp(event: PointerEvent): void {
    if (!drag || drag.source !== 'sheet' || event.pointerId !== drag.pointerId) return
    const offset = Math.max(event.clientY - drag.startY, 0)
    // Measured against the real release moment rather than the last recorded
    // sample, so a finger held still before lifting decays toward zero instead of
    // dismissing on however fast it was moving before it stopped.
    const velocity = drag.tracker.velocityAt(event.clientY, event.timeStamp)
    const dismiss = shouldDismiss({ offset, velocity, height: sheet.offsetHeight })
    drag = null
    resetDragVisuals()
    if (dismiss) close()
  }

  function onTriggerPointerDown(event: PointerEvent): void {
    clearStaleDrag()
    if (drag || !event.isPrimary) return
    beginDrag(trigger, event, 'trigger')
  }

  function onTriggerPointerUp(event: PointerEvent): void {
    if (!drag || drag.source !== 'trigger' || event.pointerId !== drag.pointerId) return
    const travelled = drag.startY - event.clientY
    drag = null
    // Short of the threshold this was a tap that rolled a few pixels, which is
    // what a thumb pressing a button does — leave it to the click handler.
    if (travelled < SWIPE_OPEN_DISTANCE) return
    swipeOpened = true
    open()
  }

  // A cancelled gesture is not a completed one, and must never reach the dismiss
  // decision. The spec does not guarantee a cancelled pointer's coordinates:
  // Chromium happens to zero them, which today makes a cancelled drag's offset
  // clamp to 0 and fall through shouldDismiss's own "offset <= 0" guard by
  // coincidence — but an engine that retained the last real coordinates would
  // hand it a positive offset and a stale velocity and dismiss a gesture the
  // browser aborted rather than one the user released. So this resets the same
  // state a release does and always springs back, on the trigger as well as the
  // sheet: a swipe cancelled by the platform must not leave `drag` permanently
  // set either.
  function onPointerCancel(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return
    const wasSheetDrag = drag.source === 'sheet'
    drag = null
    if (wasSheetDrag) resetDragVisuals()
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
      // A drag mid-flight at teardown holds a real pointer capture, and dropping
      // the reference to it does not end it: until that pointer is lifted, the
      // element keeps receiving events that now belong to nobody. Handing the
      // capture back makes the teardown total rather than merely quiet — and it
      // is guarded, because releasing a capture the element does not hold throws.
      if (drag?.capturedBy.hasPointerCapture(drag.pointerId)) {
        drag.capturedBy.releasePointerCapture(drag.pointerId)
      }
      drag = null
      swipeOpened = false
      // Left behind, a stray data-tz-dragging also keeps the sheet's own
      // transition disabled, so every future open and close would be dead until
      // the next drag happened to clear it.
      delete sheet.dataset.tzDragging
    },
    consumeSwipeClick() {
      const opened = swipeOpened
      swipeOpened = false
      return opened
    },
  }
}
