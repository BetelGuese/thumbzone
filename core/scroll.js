/**
 * Scroll-direction-aware trigger visibility, shared by every system.
 *
 * DOM-touching but framework-free — see `core/behaviour.js` for why that
 * boundary is drawn where it is, and why `core/index.js` stays on the other
 * side of it. Split out of `behaviour.js` for the same reason each port used
 * to split its own copy out of its lifecycle module: that module owns open,
 * close, focus, `inert`, the menu order and teardown, and stays readable only
 * if this lives beside it rather than inside it. It has no purpose or
 * lifecycle of its own outside `createThumbzoneBehaviour`.
 */

import { createScrollDirectionTracker } from './index.js'

/**
 * Tucks the trigger away on a downward document scroll and brings it back on
 * an upward one.
 *
 * Listens on `window`, never on the menu. The menu owns the sheet's overflow,
 * and a `scroll` event does not bubble past the element that scrolled — so
 * this is blind to the menu's own scrolling by construction rather than by a
 * filter that could be got wrong. Reading through an overflowing menu must
 * never tuck the trigger.
 *
 * @param {object} deps
 * @param {HTMLElement} deps.trigger The element carrying `data-tz-trigger`.
 * @param {() => boolean} deps.isOpen Read fresh on every scroll: the trigger
 *   must never tuck while the sheet is open.
 * @returns {{ clearTucked: () => void, detach: () => void }} `clearTucked` is
 *   exposed so no caller needs to know that `data-tz-tucked` is this module's
 *   attribute to manage: opening the sheet and tearing the instance down both
 *   have to clear it, and both go through here rather than reaching past this
 *   module into the dataset.
 */
export function attachScrollAwareness({ trigger, isOpen }) {
  // Left at its default threshold rather than handed one: core's own default
  // *is* the shared jitter threshold, so passing it back in would be a caller
  // restating a tuned value it does not own.
  const trackScroll = createScrollDirectionTracker()

  function clearTucked() {
    delete trigger.dataset.tzTucked
  }

  function onScroll() {
    const maxScrollY = document.documentElement.scrollHeight - window.innerHeight
    const next = trackScroll(window.scrollY, maxScrollY)
    // The tracker keeps running while the sheet is open so that its anchor
    // still reflects wherever the page ended up by the time the sheet closes;
    // skipping the call outright would leave a stale anchor and read the first
    // post-close scroll as a far larger jump than the user actually made. Only
    // the visible mutation is gated on the open state.
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
