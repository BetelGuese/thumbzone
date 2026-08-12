/**
 * The behaviour every design system's port shares: opening and closing, the
 * focus trap, `inert`, the thumb-first menu order, and teardown — wired to the
 * gesture engine in `gestures.js` and the scroll-aware tucking in `scroll.js`.
 *
 * DOM-touching, and framework-free by rule. `core/index.js` holds to a
 * stricter line — nothing there touches the DOM at all, which is what lets it
 * be unit-tested without a browser — and that rule is precisely what kept
 * everything in this file out of it. The two stay separate rather than merging
 * so that guarantee survives.
 *
 * A port supplies its markup, its styling and motion tokens, its framework
 * binding and its hydration strategy, and drives this. What it must not
 * reimplement is anything below: the attribute sequence, the trap, the reorder
 * and the teardown order are the pattern, not a system's interpretation of it.
 *
 * Importing no framework is also what lets the pattern be live before a port's
 * framework has finished downloading: a server-rendered page can wire this from
 * a module script during load and let its component adopt the instance on
 * mount. It is why the state lives in the DOM, written with `setAttribute` and
 * `dataset` rather than by re-rendering — `destroy()` has to hand the DOM back
 * as the markup authored it, and be followed by an initialiser running over
 * whatever is there now.
 */

import { FALLBACK_TRIGGER_LABEL_CLOSED, FALLBACK_TRIGGER_LABEL_OPEN, FOCUSABLE } from './index.js'
import { attachGestures } from './gestures.js'
import { attachScrollAwareness } from './scroll.js'

/**
 * The focusable elements inside `root`, in DOM order.
 *
 * The visibility filter is what makes the shared `FOCUSABLE` selector correct:
 * an element can match the selector while rendering nothing, and a trap that
 * walked it would strand the user on a step that does nothing.
 *
 * `document.activeElement` is exempt from that filter because the trap's very
 * next move is to look up its own position with `indexOf(document.activeElement)`.
 * Filtering out whatever currently holds focus would make that lookup return
 * -1 and send every Tab back to the start of the list instead of one step
 * along it.
 *
 * @param {HTMLElement} root
 * @returns {HTMLElement[]}
 */
export function focusableWithin(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

/**
 * Wires the pattern's behaviour over already-rendered contract markup.
 *
 * The five elements are a precondition rather than something checked here: a
 * port validates its own refs, in its own idiom, and fails with its own
 * message before reaching this.
 *
 * @param {{ trigger: HTMLElement, sheet: HTMLElement, scrim: HTMLElement,
 *   menu: HTMLElement, inertRoot: HTMLElement }} elements
 * @returns {{ open: () => void, close: () => void, destroy: () => void }}
 *   `destroy()` is deliberately not idempotent: it undoes init-time DOM
 *   mutations, and undoing one twice would put it back. A port whose handle
 *   has more than one owner guards that itself.
 */
export function createThumbzoneBehaviour({ trigger, sheet, scrim, menu, inertRoot }) {
  // Read before anything below writes, so destroy() hands back what the markup
  // itself authored rather than this module's defaults. `hidden` is stripped on
  // every state change — a sheet that is display: none has nothing for the open
  // transition to animate and makes `inert` decorative — but a consumer who
  // authored it as a no-JS default still gets it back at teardown. The inline
  // transform is captured for the same reason: it is the channel a drag tracks
  // the finger through, so clearing it at teardown would silently discard a
  // value the markup put there.
  const authoredTriggerLabel = trigger.getAttribute('aria-label')
  const authoredSheetTabIndex = sheet.getAttribute('tabindex')
  const authoredSheetHidden = sheet.hasAttribute('hidden')
  const authoredScrimHidden = scrim.hasAttribute('hidden')
  const authoredSheetTransform = sheet.style.transform

  let isOpen = false

  function setOpen(next) {
    isOpen = next
    sheet.toggleAttribute('hidden', false)
    scrim.toggleAttribute('hidden', false)
    sheet.dataset.tzOpen = String(next)
    scrim.dataset.tzOpen = String(next)
    trigger.setAttribute('aria-expanded', String(next))
    // Only ever names an unnamed trigger — an authored name is left alone. A
    // port or consumer names the trigger in its own words and language
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
    // tree itself, or its links stay reachable by keyboard/screen-reader users
    // even though the sheet looks closed. `inert` does this without the
    // `hidden`/`display: none` that would also kill the transition.
    sheet.toggleAttribute('inert', !next)
  }

  function open() {
    if (isOpen) return
    setOpen(true)
    // The trigger and an open sheet never compete for the thumb's reach at
    // once — scroll-driven tucking only means anything while the sheet itself
    // is off-screen and the trigger is what the thumb needs to find.
    scrollAwareness.clearTucked()
    // Focused after `inert` came off above: an inert subtree refuses
    // programmatic focus too, so the order here is load-bearing rather than
    // stylistic. The sheet itself is the fallback for a menu with nothing
    // focusable in it, which is what its tabindex="-1" is for.
    const [first] = focusableWithin(sheet)
    ;(first ?? sheet).focus()
  }

  function close() {
    if (!isOpen) return
    setOpen(false)
    // Every close path lands here — trigger, scrim, Escape — so returning
    // focus once, at the bottom of the funnel, is what makes that promise hold
    // for all three rather than for whichever one was remembered.
    trigger.focus()
  }

  // Before anything that can reach open() — the gesture listeners below, the
  // click handler, the returned handle. open() clears the tucked state through
  // this binding, so a swipe arriving while it was still uninitialised would
  // throw on the temporal dead zone rather than open the sheet. `isOpen` is
  // passed as a closure precisely so that this ordering constraint runs one
  // way only: the tracker reads the flag when a scroll happens, never at
  // attach time, so it does not care what is or is not initialised here yet.
  const scrollAwareness = attachScrollAwareness({ trigger, isOpen: () => isOpen })

  const gestures = attachGestures({ sheet, trigger, menu, open, close })

  function onTriggerClick() {
    // A recognised swipe-open already opened the sheet; the 'click' the
    // browser synthesizes right after that same gesture must not also be
    // treated as a fresh tap, or it would toggle the sheet straight back shut
    // a moment after opening it.
    if (gestures.consumeSwipeClick()) return
    if (isOpen) close()
    else open()
  }

  function onScrimClick() {
    close()
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
    // Every Tab is answered here, not just the two at the ends of the list.
    // Catching only the boundary and letting the browser walk the middle looks
    // equivalent and is not: WebKit leaves a plain `<a href>` out of its native
    // tab sequence entirely unless Full Keyboard Access is on, so a mid-list
    // press would step out of the sheet there while passing everywhere else.
    // Owning every step keeps the trap correct on every engine, and keeps the
    // order it walks identical to the DOM order the sheet renders in.
    event.preventDefault()
    const currentIndex = focusable.indexOf(document.activeElement)
    // indexOf is -1 whenever focus sits on something outside the list — the
    // sheet's own tabindex="-1" fallback, say. Treated as "just before the
    // sequence", because feeding -1 into the wrap arithmetic would land a
    // forward Tab one element short and a backward one two.
    const nextIndex =
      currentIndex === -1
        ? event.shiftKey
          ? focusable.length - 1
          : 0
        : (currentIndex + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length
    focusable[nextIndex].focus()
  }

  trigger.addEventListener('click', onTriggerClick)
  scrim.addEventListener('click', onScrimClick)
  // On the document rather than the sheet: Escape has to work with focus
  // anywhere, including on <body> after something focused was removed.
  document.addEventListener('keydown', onKeydown)

  // Focusable only as the fallback an empty menu needs, and never a stop in the
  // tab sequence itself. A port may author it in its markup as well — the
  // markup is what a hydrating port has to match — and the pattern still sets
  // it so that markup which authored none is not left without the fallback.
  sheet.setAttribute('tabindex', '-1')
  setOpen(false)

  // Authors list the menu most-used-first, and the most-used item has to land
  // nearest the thumb — at the bottom of the list, which in DOM terms is last.
  //
  // Reordered in the DOM rather than repainted with `flex-direction:
  // column-reverse`, because the focus order has to track the visual order
  // (WCAG 1.3.2): the trap above walks this same DOM order, so a CSS-only
  // reversal would tab through the menu bottom-to-top against what is on
  // screen.
  //
  // append(), not replaceChildren(): every node passed is already a child of
  // the menu, so this moves them into their new order in place rather than
  // emptying the menu first — which would silently drop any non-element node
  // (whitespace, a comment) a hand-authored consumer left between the items,
  // with nothing for destroy() to hand back. `children` for the same reason:
  // only the elements are moved, so anything else stays where the markup put
  // it. The drag handle is authored as the menu's sibling, not its child, so
  // it is never touched by this.
  const reordersMenu = menu.dataset.tzOrder !== 'dom'
  if (reordersMenu) menu.append(...Array.from(menu.children).reverse())

  return {
    open,
    close,
    destroy() {
      // Closed first. destroy() can arrive while the sheet is open, and without
      // this the whole app would be left permanently inert with every listener
      // that could have recovered it already gone. It also puts the sheet,
      // scrim and trigger back to the same closed values the markup authors, so
      // a destroyed instance and a never-initialised page look alike.
      const wasOpen = isOpen
      setOpen(false)
      // setOpen leaves focus where it was — on a menu link that has just become
      // inert, which blurs to <body> with nothing to move it on. Tearing down
      // from an open state hands focus back to the trigger like a normal close,
      // or a keyboard user loses their place entirely.
      if (wasOpen) trigger.focus()

      trigger.removeEventListener('click', onTriggerClick)
      scrim.removeEventListener('click', onScrimClick)
      document.removeEventListener('keydown', onKeydown)
      // Each of these releases a pointer capture or a tucked attribute of its
      // own, so neither a drag nor a tuck in flight at teardown survives it.
      gestures.detach()
      scrollAwareness.detach()
      scrollAwareness.clearTucked()
      // The reorder has no CSS counterpart to defer to, so it is undone by the
      // same in-place move that applied it.
      if (reordersMenu) menu.append(...Array.from(menu.children).reverse())

      // tabindex is one of a kind with the reorder: an init-time addition with
      // no state of its own to reset. Restored rather than removed outright,
      // because a port may have authored it in the markup the pattern was
      // wired over, and removing it then would strip something that was never
      // this module's to take.
      if (authoredSheetTabIndex === null) sheet.removeAttribute('tabindex')
      else sheet.setAttribute('tabindex', authoredSheetTabIndex)
      // The same shape for the fallback name: it only ever exists where the
      // markup authored none, so restoring means removing it — and an authored
      // name needs no restoring, because nothing overwrote it.
      if (authoredTriggerLabel === null) trigger.removeAttribute('aria-label')
      // Whatever the markup had inline, back verbatim. The empty string is the
      // honest restoration of "nothing inline": assigning it drops the
      // declaration rather than leaving `transform: ;` behind, so a sheet that
      // was never dragged ends up with the class-declared transform back in
      // charge.
      sheet.style.transform = authoredSheetTransform
      // setOpen has just stripped `hidden` again on its way out, so these come
      // last.
      sheet.toggleAttribute('hidden', authoredSheetHidden)
      scrim.toggleAttribute('hidden', authoredScrimHidden)
    },
  }
}
