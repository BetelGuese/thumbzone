/**
 * thumbzone — variant 1 (bottom trigger + bottom sheet), normative reference.
 * Zero dependencies, no build step. Every port must match this behaviour.
 */

import { attachGestures } from './gestures.js'
import { attachScrollAwareness } from './scroll.js'
import {
  FALLBACK_TRIGGER_LABEL_CLOSED,
  FALLBACK_TRIGGER_LABEL_OPEN,
  FOCUSABLE,
  dragProgress,
  shouldDismiss,
  createVelocityTracker,
} from '../../../core/index.js'

// scroll.js and gestures.js exist only as internal splits of this module. Every
// value shared across design systems lives in core/index.js and is imported
// from there by name, here and in every port alike — this module re-exports
// none of them. Importing a shared constant "from vanilla" would work and be
// wrong: it reads as though the reference implementation owns the contract,
// which is the habit `core/` exists to break. What this file does export is
// only what is genuinely the reference implementation's own.

/** Duration (ms) of the sheet's open/close transition. */
export const SHEET_TRANSITION_MS = 240

/** Easing of the sheet's open/close transition. */
export const SHEET_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)'

/** Duration (ms) every named transition collapses to under prefers-reduced-motion. */
export const REDUCED_MOTION_TRANSITION_MS = 1

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

  // Captured before anything below mutates them, so destroy() can hand back
  // the state the markup itself authored rather than this module's own
  // defaults. `hidden` is stripped on every setOpen because a sheet that is
  // display: none has nothing for the open transition to animate and makes
  // `inert` decorative; a consumer who authored it nonetheless still gets it
  // back at teardown.
  const authoredTriggerLabel = trigger.getAttribute('aria-label')
  const authoredSheetHidden = sheet.hasAttribute('hidden')
  const authoredScrimHidden = scrim.hasAttribute('hidden')

  let isOpen = false

  function setOpen(next) {
    isOpen = next
    sheet.toggleAttribute('hidden', false)
    scrim.toggleAttribute('hidden', false)
    sheet.dataset.tzOpen = String(next)
    scrim.dataset.tzOpen = String(next)
    trigger.setAttribute('aria-expanded', String(next))
    // Only ever names an unnamed trigger — an authored name is left alone.
    // A port or consumer names the trigger in its own words and language
    // ("Navigation", "Menü"), and overwriting that with an English string on
    // every state change loses it silently; the open/closed state itself is
    // already carried by aria-expanded above, so nothing is left unsaid by
    // keeping the authored wording in both states.
    if (authoredTriggerLabel === null) {
      trigger.setAttribute('aria-label', next ? FALLBACK_TRIGGER_LABEL_OPEN : FALLBACK_TRIGGER_LABEL_CLOSED)
    }
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
      // tabindex is one of a kind with the reorder: a pure init-time addition
      // with no markup equivalent to fall back to, removed outright rather
      // than reset via setOpen — same reasoning as the line above it.
      sheet.removeAttribute('tabindex')
      // The same for the fallback accessible name, which is only ever added
      // where the markup authored none — so restoring it means removing it,
      // and an authored name needs no restoring because nothing overwrote it.
      if (authoredTriggerLabel === null) trigger.removeAttribute('aria-label')
      // setOpen() above has just stripped `hidden` again on its way out, so
      // these come last.
      sheet.toggleAttribute('hidden', authoredSheetHidden)
      scrim.toggleAttribute('hidden', authoredScrimHidden)
      initializedSheets.delete(sheet)
    },
  }
}
