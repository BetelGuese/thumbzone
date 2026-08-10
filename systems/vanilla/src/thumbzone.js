/**
 * thumbzone — variant 1 (bottom trigger + bottom sheet), normative reference.
 * Zero dependencies, no build step. Every port must match this behaviour.
 */

/** Fraction of sheet height a drag must pass to dismiss. */
export const DISMISS_RATIO = 0.25

/** Downward velocity (px/ms) that dismisses regardless of distance. */
export const FLING_VELOCITY = 0.5

/** Scroll delta (px) below which the trigger ignores movement, to avoid jitter. */
export const SCROLL_THRESHOLD = 8

function assertPositiveHeight(height) {
  if (!Number.isFinite(height) || height <= 0) {
    throw new RangeError(`thumbzone: sheet height must be positive, received ${height}`)
  }
}

/**
 * Fraction of the sheet that has been dragged away, clamped to 0–1.
 * @param {number} offset Pixels dragged downward from rest.
 * @param {number} height Sheet height in pixels.
 * @returns {number}
 */
export function dragProgress(offset, height) {
  assertPositiveHeight(height)
  return Math.min(Math.max(offset / height, 0), 1)
}

/**
 * Whether a released drag should dismiss the sheet.
 * @param {{ offset: number, velocity: number, height: number }} gesture
 * @returns {boolean}
 */
export function shouldDismiss({ offset, velocity, height }) {
  assertPositiveHeight(height)
  if (offset <= 0) return false
  return offset >= height * DISMISS_RATIO || velocity >= FLING_VELOCITY
}

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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

function focusableWithin(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

/**
 * Wire up a thumbzone sheet. Returns handles for programmatic control.
 * @param {{ trigger: HTMLElement, sheet: HTMLElement, scrim: HTMLElement, menu: HTMLElement, inertRoot: HTMLElement }} refs
 */
export function initThumbzone({ trigger, sheet, scrim, menu, inertRoot }) {
  const missing = Object.entries({ trigger, sheet, scrim, menu, inertRoot })
    .filter(([, el]) => !el)
    .map(([name]) => name)
  if (missing.length > 0) {
    throw new TypeError(`thumbzone: initThumbzone is missing required element(s): ${missing.join(', ')}`)
  }

  let isOpen = false

  function setOpen(next) {
    isOpen = next
    sheet.toggleAttribute('hidden', false)
    scrim.toggleAttribute('hidden', false)
    sheet.dataset.tzOpen = String(next)
    scrim.dataset.tzOpen = String(next)
    trigger.setAttribute('aria-expanded', String(next))
    trigger.setAttribute('aria-label', next ? 'Close menu' : 'Open menu')
    inertRoot.toggleAttribute('inert', next)
    // The mirror of inertRoot above: a closed sheet is still fully rendered
    // (only translated off-screen, so the open transition has something to
    // animate), so it must be taken out of the tab order and accessibility
    // tree itself, or its links stay reachable by keyboard/screen-reader
    // users even though the sheet looks closed. `inert` does this without
    // the `hidden`/`display: none` that would also kill the transition.
    sheet.toggleAttribute('inert', !next)
  }

  function open() {
    if (isOpen) return
    setOpen(true)
    const [first] = focusableWithin(sheet)
    ;(first ?? sheet).focus()
  }

  function close() {
    if (!isOpen) return
    setOpen(false)
    trigger.focus()
  }

  function onTriggerClick() {
    isOpen ? close() : open()
  }

  function onKeydown(event) {
    if (!isOpen) return
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = focusableWithin(sheet)
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    // Cycle focus ourselves instead of only catching the boundary and
    // otherwise deferring to native Tab traversal: WebKit does not put
    // plain `<a href>` elements (no tabindex) in the native tab sequence at
    // all, so mid-list presses would silently walk focus out of the sheet
    // there. Owning every step keeps the trap correct on every engine.
    event.preventDefault()
    const step = event.shiftKey ? -1 : 1
    const currentIndex = focusable.indexOf(document.activeElement)
    const nextIndex = (currentIndex + step + focusable.length) % focusable.length
    focusable[nextIndex].focus()
  }

  trigger.addEventListener('click', onTriggerClick)
  scrim.addEventListener('click', close)
  document.addEventListener('keydown', onKeydown)

  // The sheet is focusable only as a fallback for an empty menu; it must not
  // appear in the tab sequence itself.
  sheet.setAttribute('tabindex', '-1')
  setOpen(false)

  return {
    open,
    close,
    destroy() {
      trigger.removeEventListener('click', onTriggerClick)
      scrim.removeEventListener('click', close)
      document.removeEventListener('keydown', onKeydown)
    },
  }
}
