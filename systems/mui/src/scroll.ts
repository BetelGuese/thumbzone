/**
 * Scroll-direction-aware trigger visibility for the Material UI port.
 *
 * Split out of `thumbzone.ts` alongside `gestures.ts`, and for the same reason:
 * it has no purpose or lifecycle of its own outside `initThumbzone`.
 */

import { createScrollDirectionTracker } from '../../../core/index.js'

/** What `attachScrollAwareness` hands back to the lifecycle that owns it. */
export interface ScrollAwarenessHandle {
  /**
   * Clears the tucked state.
   *
   * Exposed so no caller needs to know that `data-tz-tucked` is this module's
   * attribute to manage: opening the sheet and tearing the instance down both
   * have to clear it, and both go through here rather than reaching past this
   * module into the dataset.
   */
  clearTucked: () => void
  /** Removes the scroll listener. Pair with `clearTucked` at teardown. */
  detach: () => void
}

/**
 * Tucks the trigger away on a downward document scroll and brings it back on an
 * upward one.
 *
 * Listens on `window`, never on the menu. The menu owns the sheet's overflow, and
 * a `scroll` event does not bubble past the element that scrolled — so this is
 * blind to the menu's own scrolling by construction rather than by a filter that
 * could be got wrong. Reading through an overflowing menu must never tuck the
 * trigger.
 *
 * @param deps.trigger The element carrying `data-tz-trigger`.
 * @param deps.isOpen Read fresh on every scroll: the trigger must never tuck
 *   while the sheet is open.
 */
export function attachScrollAwareness({
  trigger,
  isOpen,
}: {
  trigger: HTMLElement
  isOpen: () => boolean
}): ScrollAwarenessHandle {
  // Left at its default threshold rather than handed one: core's own default *is*
  // the shared jitter threshold, so passing it back in would be this port
  // restating a tuned value it does not own.
  const trackScroll = createScrollDirectionTracker()

  function clearTucked(): void {
    delete trigger.dataset.tzTucked
  }

  function onScroll(): void {
    const maxScrollY = document.documentElement.scrollHeight - window.innerHeight
    const next = trackScroll(window.scrollY, maxScrollY)
    // The tracker keeps running while the sheet is open so that its anchor still
    // reflects wherever the page ended up by the time the sheet closes; skipping
    // the call outright would leave a stale anchor and read the first post-close
    // scroll as a far larger jump than the user actually made. Only the visible
    // mutation is gated on the open state.
    if (next === null || isOpen()) return
    if (next === 'hide') trigger.dataset.tzTucked = 'true'
    else clearTucked()
  }

  window.addEventListener('scroll', onScroll, { passive: true })

  return {
    clearTucked,
    detach() {
      window.removeEventListener('scroll', onScroll)
    },
  }
}
