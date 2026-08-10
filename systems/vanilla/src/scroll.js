/**
 * Scroll-direction-aware trigger visibility. Split out of thumbzone.js
 * purely to keep that file within its line-count budget as later behaviour
 * lands there; this module has no purpose or lifecycle of its own outside
 * of initThumbzone.
 */

/**
 * Tucks the trigger off-screen on scroll-down and brings it back on
 * scroll-up. Listens on `window`, never on the menu: the menu owns its own
 * overflow now (see thumbzone.css), and its 'scroll' events do not bubble to
 * `window` at all, so this is naturally blind to menu scrolling without
 * needing to special-case it.
 * @param {object} deps
 * @param {HTMLElement} deps.trigger
 * @param {() => boolean} deps.isOpen Read fresh on every scroll — the
 *   trigger must never tuck while the sheet is open.
 * @param {(scrollY: number, maxScrollY: number) => ('show' | 'hide' | null)} deps.trackScroll
 *   An update function from `createScrollDirectionTracker`, created and
 *   owned by the caller so its jitter-absorbing anchor persists across
 *   scrolls for this sheet's whole lifetime.
 * @returns {{ detach: () => void }}
 */
export function attachScrollAwareness({ trigger, isOpen, trackScroll }) {
  function onScroll() {
    const maxScrollY = document.documentElement.scrollHeight - window.innerHeight
    const next = trackScroll(window.scrollY, maxScrollY)
    // trackScroll still runs even while open, so its anchor reflects
    // wherever the page ended up by the time the sheet closes — skipping
    // the call outright while open would leave a stale anchor and could
    // read the very first post-close scroll as a much larger jump than the
    // user actually made. Only the visible mutation itself is gated here.
    if (next === null || isOpen()) return
    if (next === 'hide') {
      trigger.dataset.tzTucked = 'true'
    } else {
      delete trigger.dataset.tzTucked
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true })

  return {
    detach() {
      window.removeEventListener('scroll', onScroll)
    },
  }
}
