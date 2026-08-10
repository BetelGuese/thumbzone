/**
 * thumbzone — variant 1 (bottom trigger + bottom sheet), normative reference.
 * Zero dependencies, no build step. Every port must match this behaviour.
 */

import { attachGestures } from './gestures.js'
import { attachScrollAwareness } from './scroll.js'

// Re-exported so the public surface (and every existing import of this
// module) stays unchanged now that both live in scroll.js, which is their
// only consumer.
export { SCROLL_THRESHOLD, createScrollDirectionTracker } from './scroll.js'

/** Fraction of sheet height a drag must pass to dismiss. */
export const DISMISS_RATIO = 0.25

/** Downward velocity (px/ms) that dismisses regardless of distance. */
export const FLING_VELOCITY = 0.5

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

/** Time window (ms) a drag's velocity is averaged over, to smooth event-to-event jitter. */
export const VELOCITY_WINDOW_MS = 80

/**
 * Tracks a drag's vertical velocity from a stream of (position, time)
 * samples, windowed rather than taken from the single most recent delta. A
 * last-sample-only reading is extremely sensitive to cadence: at a high
 * touch sampling rate, one pixel of jitter between adjacent events can
 * already read as a meaningful fraction of FLING_VELOCITY, so identical
 * gestures would dismiss or not depending on the hardware, not the user.
 * Averaging over VELOCITY_WINDOW_MS absorbs that noise while still
 * capturing a genuine flick, which happens well within that span.
 * @returns {{ record: (position: number, time: number) => void, velocityAt: (position: number, time: number) => number }}
 */
export function createVelocityTracker() {
  const samples = []

  return {
    record(position, time) {
      samples.push({ position, time })
      while (samples.length > 1 && time - samples[0].time > VELOCITY_WINDOW_MS) {
        samples.shift()
      }
    },
    // Takes the *release* position/time explicitly rather than reusing the
    // last recorded sample: a finger held still before lifting generates no
    // further move events, so measuring against the real release moment —
    // against however stale the window has become — decays velocity toward
    // zero for a deliberate pause, instead of dismissing on however fast
    // the user was moving before they stopped.
    velocityAt(position, time) {
      if (samples.length === 0) return 0
      const oldest = samples[0]
      const elapsed = time - oldest.time
      if (elapsed <= 0) return 0
      return (position - oldest.position) / elapsed
    },
  }
}

/** Shared with e2e tests so the "what counts as focusable" definition has one source of truth. */
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

function focusableWithin(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

// Guards against wiring the same sheet twice (e.g. a caller re-running init
// without destroying the previous instance first), which would otherwise
// leave two 'keydown' listeners on document reacting to every open sheet.
const initializedSheets = new WeakSet()

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
  if (initializedSheets.has(sheet)) {
    throw new Error(
      'thumbzone: initThumbzone was already called for this sheet; call destroy() on the previous instance first',
    )
  }
  initializedSheets.add(sheet)

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
    // The trigger and an open sheet never compete for the thumb's reach at
    // once — scroll-driven tucking only means anything while the sheet
    // itself is off-screen and the trigger is what the thumb needs to find.
    scrollAwareness.clearTucked()
    const [first] = focusableWithin(sheet)
    ;(first ?? sheet).focus()
  }

  function close() {
    if (!isOpen) return
    setOpen(false)
    trigger.focus()
  }

  const gestures = attachGestures({ sheet, trigger, menu, dragProgress, shouldDismiss, createVelocityTracker, open, close })

  function onTriggerClick() {
    // A recognised swipe-open already opened the sheet; the 'click' the
    // browser synthesizes right after that same gesture must not also be
    // treated as a fresh tap, or it would toggle the sheet straight back
    // shut a moment after opening it.
    if (gestures.consumeSwipeClick()) return
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
    const currentIndex = focusable.indexOf(document.activeElement)
    // indexOf is -1 when focus is on something outside the focusable list
    // (e.g. the sheet's own tabindex="-1" fallback) — treat that as "just
    // before the sequence" rather than letting the -1 skew the wrap math
    // and land one element short.
    const nextIndex =
      currentIndex === -1
        ? event.shiftKey
          ? focusable.length - 1
          : 0
        : (currentIndex + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length
    focusable[nextIndex].focus()
  }

  trigger.addEventListener('click', onTriggerClick)
  scrim.addEventListener('click', close)
  document.addEventListener('keydown', onKeydown)

  // The sheet is focusable only as a fallback for an empty menu; it must not
  // appear in the tab sequence itself.
  sheet.setAttribute('tabindex', '-1')
  setOpen(false)

  // Authors list the menu most-used-first; the most-used item must land
  // nearest the thumb, at the bottom of the list. Reordering the DOM rather
  // than reversing with `flex-direction: column-reverse` keeps the focus
  // order matching the visual order (WCAG 1.3.2) — the trap above walks
  // this same DOM order, so getting this right is what makes tabbing
  // through the menu track what's on screen. menu.children only ever holds
  // the list items themselves; the drag handle is authored as a sibling of
  // the menu, not a child, so it is never touched by this. append(), not
  // replaceChildren(): the given nodes are already menu's own children, so
  // this moves them into their new order in place, rather than removing
  // every child outright first — which would silently drop any non-element
  // node (whitespace, a comment) a hand-authored consumer's markup left
  // between the list items, with no way for destroy() to restore what it
  // never got to keep.
  const reordersMenu = menu.dataset.tzOrder !== 'dom'
  if (reordersMenu) {
    menu.append(...Array.from(menu.children).reverse())
  }

  const scrollAwareness = attachScrollAwareness({ trigger, isOpen: () => isOpen })

  return {
    open,
    close,
    destroy() {
      // Close first: destroy() can be called while the sheet is open, and
      // without this, inertRoot (the whole app) would be left permanently
      // inert with every listener that could have recovered it already
      // gone. setOpen(false) also restores the sheet/trigger/scrim
      // attributes to the same closed defaults the markup itself authors,
      // so a destroyed instance and a never-initialised page look alike.
      const wasOpen = isOpen
      setOpen(false)
      // setOpen() alone leaves focus wherever it was — on a menu link that
      // is about to become inert, which would blur to <body> with nothing
      // to move it on. Tearing down from an open state must hand focus
      // back to the trigger, the same as a normal close(), or a keyboard
      // user loses their place entirely.
      if (wasOpen) trigger.focus()
      trigger.removeEventListener('click', onTriggerClick)
      scrim.removeEventListener('click', close)
      document.removeEventListener('keydown', onKeydown)
      gestures.detach()
      scrollAwareness.detach()
      scrollAwareness.clearTucked()
      // The reorder has no CSS counterpart to fall back to, so it is undone
      // outright here — a purely init-time DOM mutation, the same as the
      // tabindex removal below.
      if (reordersMenu) {
        menu.append(...Array.from(menu.children).reverse())
      }
      // tabindex is the last of this kind: a pure init-time addition with no
      // markup equivalent to fall back to, removed outright rather than
      // reset via setOpen — same reasoning as the line above it.
      sheet.removeAttribute('tabindex')
      initializedSheets.delete(sheet)
    },
  }
}
