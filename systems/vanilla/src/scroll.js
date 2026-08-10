/**
 * Scroll-direction-aware trigger visibility. Split out of thumbzone.js
 * purely to keep that file within its line-count budget as later behaviour
 * lands there; this module has no purpose or lifecycle of its own outside
 * of initThumbzone.
 */

/** Scroll delta (px) below which the trigger ignores movement, to avoid jitter. */
export const SCROLL_THRESHOLD = 8

/**
 * Tracks scroll direction, ignoring sub-threshold jitter.
 * Returns 'show' | 'hide' when the trigger should change state, or null when it should not.
 * The document start and end always force 'show' so the trigger can never be
 * stranded off-screen where the user has nowhere left to scroll.
 * @param {{ threshold?: number }} [options]
 */
export function createScrollDirectionTracker({ threshold = SCROLL_THRESHOLD } = {}) {
  let anchor = 0
  return function update(scrollY, maxScrollY) {
    if (scrollY <= 0 || scrollY >= maxScrollY) {
      anchor = scrollY
      return 'show'
    }
    const delta = scrollY - anchor
    if (Math.abs(delta) < threshold) return null
    anchor = scrollY
    return delta > 0 ? 'hide' : 'show'
  }
}

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
 * @returns {{ clearTucked: () => void, detach: () => void }} `clearTucked`
 *   is exposed so callers never need to know `data-tz-tucked` is this
 *   module's attribute to manage — thumbzone.js calls it instead of
 *   reaching past this module to mutate the dataset directly.
 */
export function attachScrollAwareness({ trigger, isOpen }) {
  const trackScroll = createScrollDirectionTracker()

  function clearTucked() {
    delete trigger.dataset.tzTucked
  }

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
      clearTucked()
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true })

  return {
    clearTucked,
    detach() {
      window.removeEventListener('scroll', onScroll)
    },
  }
}
