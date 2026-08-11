/**
 * The behaviour half of the Material UI port: opening, closing, focus, `inert`,
 * the drag and swipe gestures, scroll-aware tucking and the thumb-first menu
 * order. It imports no framework, deliberately — see `useThumbzone` for the
 * React binding that mounts it. Framework-*agnostic* it is not: it knows what
 * rendering MUI to a string leaves in the markup (see
 * `hoistServerRenderedStyles`), which is the price of running before the
 * framework does.
 *
 * Material UI supplies none of this here, and that is a consequence of the
 * markup rather than a gap in the library. The services a porter reaches for —
 * a focus trap, Escape-to-close, a backdrop, return-focus — all belong to
 * `Modal`, not to `Drawer`, and the contract rules the `Modal`-backed temporary
 * variant out (see `ThumbzoneMenu` for why). What is left is a `Paper` rendered
 * in place, so the trap, the key handling and the focus round trip are the
 * port's own. MUI still owns everything it can: the components, the theme, the
 * motion tokens, and the `Fab` that is a real `<button>` for the trigger to be.
 *
 * Importing no framework is what lets the pattern be live before the
 * island's framework has finished downloading: the sheet's markup is
 * server-rendered, so a page can wire it from a module script during load and
 * the component adopts that instance on mount. It is also why the state lives in
 * the DOM rather than in React state, and is written with
 * `setAttribute`/`dataset` rather than by re-rendering:
 *
 * - `destroy()` has to hand back the DOM as the markup authored it, and be
 *   followed by an initialiser running over *whatever is there now* —
 *   consumers and the conformance suite alike edit that DOM while no instance
 *   exists (an attribute added, a node inserted between menu items). A render
 *   driven from props would overwrite those edits on its next commit; a render
 *   driven from state could not see them at all.
 * - React only touches an attribute whose prop actually changed between
 *   renders. The contract attributes are authored once, as literals, and never
 *   move back into props — so an unrelated re-render (a ripple, a focus ring)
 *   leaves the pattern's writes alone.
 */

// Everything the pattern, every other port and the conformance suite share: the
// one definition of "focusable" (so the trap cannot drift from what the suite
// walks), and all of the gesture and scroll arithmetic. None of it is restated
// here — a port that retuned the dismiss ratio, the fling velocity, the
// velocity window, the swipe distance or the scroll threshold would no longer be
// the same interaction, which is why the maths lives in one system-agnostic
// module and every port merely drives it from its own pointer handling.
import {
  FOCUSABLE,
  SWIPE_OPEN_DISTANCE,
  createScrollDirectionTracker,
  createVelocityTracker,
  dragProgress,
  shouldDismiss,
} from '../../../core/index.js'

/**
 * The elements an instance is wired over, as the contract's `__initThumbzone`
 * hook hands them in: the results of five `querySelector` calls, nullable and
 * untyped beyond `Element`. Validated rather than trusted, so a mistyped
 * selector fails at the call with the name of what was missing instead of
 * throwing on a property access somewhere later.
 */
export interface ThumbzoneRefs {
  trigger: Element | null
  sheet: Element | null
  scrim: Element | null
  menu: Element | null
  inertRoot: Element | null
}

/** The imperative handle an initialised instance exposes. */
export interface ThumbzoneHandle {
  /** Opens the sheet and moves focus into it. No-op when already open. */
  open: () => void
  /** Closes the sheet and returns focus to the trigger. No-op when already closed. */
  close: () => void
  /** Closes if open, then restores the pre-init DOM and detaches every listener. */
  destroy: () => void
}

interface ThumbzoneElements {
  trigger: HTMLElement
  sheet: HTMLElement
  scrim: HTMLElement
  menu: HTMLElement
  inertRoot: HTMLElement
}

/**
 * A gesture in flight.
 *
 * `source` is what the pointer went down on, and it is what every later event
 * is matched against: a drag on the sheet and a swipe on the trigger are
 * different gestures with different outcomes, and only one of them can be live
 * at a time. `capturedBy` is the element holding the pointer capture, which is
 * how an abandoned drag is recognised — see `clearStaleDrag`.
 */
interface Drag {
  source: 'sheet' | 'trigger'
  pointerId: number
  startY: number
  tracker: ReturnType<typeof createVelocityTracker>
  capturedBy: HTMLElement
}

function missingElements(refs: ThumbzoneRefs): string[] {
  return Object.entries(refs)
    .filter(([, element]) => !(element instanceof HTMLElement))
    .map(([name]) => name)
}

// A predicate rather than a cast: the check and the narrowing are then the same
// statement, so a member added to the refs cannot be narrowed without also being
// checked.
function isWireable(refs: ThumbzoneRefs): refs is ThumbzoneElements {
  return missingElements(refs).length === 0
}

function requireElements(refs: ThumbzoneRefs): ThumbzoneElements {
  if (!isWireable(refs)) {
    throw new TypeError(
      `thumbzone: initThumbzone is missing required element(s): ${missingElements(refs).join(', ')}`,
    )
  }
  return refs
}

/**
 * Moves Emotion's server-rendered rules out of the pattern's own subtrees and
 * into the document head.
 *
 * Rendering MUI to a string emits each rule as a `<style>` element immediately
 * before the first element that needs it, which puts real elements inside the
 * contract's markup: one lands between the menu and its first item, making it a
 * child of the menu alongside the list items, and another lands inside the first
 * item's anchor, making its text content the stylesheet rather than the label.
 * Both would be wrong for the pattern to read — the menu's children are its
 * items, and an item's text is its name.
 *
 * Emotion does this itself, the moment its client cache is created, precisely to
 * get the elements out of React's way before hydration. All this does is bring
 * that forward to before the pattern's first look at the DOM, because on a
 * server-rendered page the pattern can be running well before the framework
 * arrives — so it copies Emotion's pass exactly rather than approximating it:
 *
 * - the same selector, queried against the document so the nodes are visited in
 *   document order and their order relative to each other survives the move;
 * - the same requirement of a space in `data-emotion`, which is what marks a
 *   rule as Emotion 11's server output rather than Emotion 10's client output;
 * - the same destination, `document.head`;
 * - the same `data-s` stamp on the way out, which is how Emotion records that a
 *   node has already been hoisted — without it, Emotion's own pass would move
 *   these nodes a second time and reorder them against anything hoisted since.
 *
 * Only nodes inside the pattern's own elements are touched. The rest of the
 * page's rules are Emotion's business, and moving them would be this module
 * reaching outside what it was handed.
 */
function hoistServerRenderedStyles(roots: HTMLElement[]): void {
  for (const style of document.querySelectorAll('style[data-emotion]:not([data-s])')) {
    if (!roots.some((root) => root.contains(style))) continue
    if (!style.getAttribute('data-emotion')?.includes(' ')) continue
    document.head.append(style)
    style.setAttribute('data-s', '')
  }
}

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  )
}

/**
 * The live instance per sheet, if any.
 *
 * One sheet takes one instance: two would leave two document `keydown`
 * listeners reacting to every open sheet, and two owners of the same
 * attributes. It is a map rather than a set so that whoever arrives second can
 * take up the instance already running instead of being turned away — the
 * component's mount, typically, after a page wired the markup during load.
 */
const liveInstances = new WeakMap<Element, ThumbzoneHandle>()

/**
 * Every sheet an instance has ever been wired over, kept past teardown.
 *
 * `liveInstances` answers "is one running now"; this answers "does this sheet
 * have an owner", which is the question a late mount has to ask. Without the
 * distinction, a component mounting over markup someone else wired would read a
 * deliberate `destroy()` as "nothing here yet" and put a replacement in place
 * that its owner never asked for.
 */
const ownedSheets = new WeakSet<Element>()

/**
 * The instance currently wired over `sheet`, or `undefined`.
 *
 * @param sheet The element carrying `data-tz-sheet`.
 */
export function liveThumbzone(sheet: Element | null): ThumbzoneHandle | undefined {
  return sheet ? liveInstances.get(sheet) : undefined
}

/**
 * Whether anything has claimed `sheet` by initialising over it, whether or not
 * an instance is live now.
 *
 * @param sheet The element carrying `data-tz-sheet`.
 */
export function hasThumbzoneOwner(sheet: Element | null): boolean {
  return sheet ? ownedSheets.has(sheet) : false
}

/**
 * Wires the pattern's behaviour over already-rendered contract markup.
 *
 * This is also what a demo route publishes as `window.__initThumbzone`, which a
 * test calls with five plain elements to re-create an instance over the DOM a
 * previous `destroy()` left behind.
 *
 * @param refs The trigger, sheet, scrim, menu and the content to make inert.
 * @returns The instance's `open`, `close` and `destroy`.
 * @throws {TypeError} If any of the five is absent.
 * @throws {Error} If this sheet already has a live instance.
 */
export function initThumbzone(refs: ThumbzoneRefs): ThumbzoneHandle {
  const { trigger, sheet, scrim, menu, inertRoot } = requireElements(refs)

  if (liveInstances.has(sheet)) {
    throw new Error(
      'thumbzone: initThumbzone was already called for this sheet; call destroy() on the previous instance first',
    )
  }

  // Before anything reads the markup, including the authored state below.
  hoistServerRenderedStyles([sheet, scrim, trigger])

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
  let destroyed = false

  function setOpen(next: boolean): void {
    isOpen = next
    sheet.toggleAttribute('hidden', false)
    scrim.toggleAttribute('hidden', false)
    sheet.dataset.tzOpen = String(next)
    scrim.dataset.tzOpen = String(next)
    trigger.setAttribute('aria-expanded', String(next))
    // Only ever names an unnamed trigger. A port or a consumer names it in its
    // own words and language ("Browse menu", "Menü"), and overwriting that with
    // an English string on every state change loses it silently — while saying
    // nothing that `aria-expanded` above has not already said.
    if (authoredTriggerLabel === null) {
      trigger.setAttribute('aria-label', next ? 'Close menu' : 'Open menu')
    }
    inertRoot.toggleAttribute('inert', next)
    // The mirror of the line above. A closed sheet stays fully rendered — only
    // translated out of view, so the open transition has something to animate —
    // which means it has to be taken out of the tab order and the accessibility
    // tree itself, or its links stay reachable by keyboard and screen-reader
    // users while the sheet looks shut. `inert` does that without the
    // `hidden`/`display: none` that would also kill the transition.
    sheet.toggleAttribute('inert', !next)
  }

  // Left at its default threshold rather than handed one: core's own default
  // *is* the shared jitter threshold, so passing it back in would be this port
  // restating a tuned value it does not own.
  const trackScroll = createScrollDirectionTracker()

  function clearTucked(): void {
    delete trigger.dataset.tzTucked
  }

  // Document scroll only. The menu is the sheet's scroll container, and a
  // scroll event does not bubble past the element that scrolled — so listening
  // on `window` is blind to the menu's own scrolling by construction rather
  // than by a filter that could be got wrong: reading through an overflowing
  // menu must never tuck the trigger.
  function onDocumentScroll(): void {
    const maxScrollY = document.documentElement.scrollHeight - window.innerHeight
    const next = trackScroll(window.scrollY, maxScrollY)
    // The tracker keeps running while the sheet is open so that its anchor
    // still reflects wherever the page ended up by the time the sheet closes;
    // skipping the call outright would leave a stale anchor and read the first
    // post-close scroll as a far larger jump than the user actually made. Only
    // the visible mutation is gated on the open state.
    if (next === null || isOpen) return
    if (next === 'hide') trigger.dataset.tzTucked = 'true'
    else clearTucked()
  }

  function open(): void {
    if (isOpen) return
    setOpen(true)
    // The trigger and an open sheet never compete for the thumb's reach at
    // once: tucking only means anything while the sheet is off-screen and the
    // trigger is what the thumb has to find.
    clearTucked()
    // Focused after `inert` came off above: an inert subtree refuses
    // programmatic focus too, so the order here is load-bearing rather than
    // stylistic. The sheet itself is the fallback for a menu with nothing
    // focusable in it, which is what its tabindex="-1" is for.
    const [first] = focusableWithin(sheet)
    ;(first ?? sheet).focus()
  }

  function close(): void {
    if (!isOpen) return
    setOpen(false)
    // Every close path lands here — trigger, scrim, Escape — so returning focus
    // once, at the bottom of the funnel, is what makes that promise hold for all
    // three rather than for whichever one was remembered.
    trigger.focus()
  }

  let drag: Drag | null = null
  // Set by a recognised swipe-open so the `click` the browser synthesizes from
  // the very same gesture can be consumed once, instead of being read as a
  // fresh tap that toggles the sheet straight back shut.
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
    // what performs the spring-back or the dismiss. destroy() is the one place
    // that puts the authored value back instead.
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
  // with the coordinates zeroed — instead of ever delivering a pointerup, so
  // the release is never evaluated at all. WebKit does not do this. Preventing
  // 'dragstart' (it bubbles up from the link or image) stops that commitment on
  // the sheet and the trigger alike, whatever content a consumer puts in either.
  function preventNativeDrag(event: Event): void {
    event.preventDefault()
  }

  function onSheetPointerDown(event: PointerEvent): void {
    clearStaleDrag()
    // A second finger landing mid-drag would otherwise re-enter beginDrag and
    // silently overwrite the first finger's start position, so the first
    // finger's own release would be measured against the interloper's — and a
    // gesture deliberately stopped short would dismiss anyway. Non-primary
    // pointers are ignored for the same reason: an accidental second touch is
    // common on a bottom sheet worked with a thumb while the hand rests nearby.
    if (drag || !event.isPrimary) return
    // The menu is the sheet's own scroll container and stays pannable at every
    // scroll position, so a drag never starts inside it regardless of where it
    // happens to be scrolled — which leaves the handle, authored as the menu's
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
    // (`transform: none`) on specificity, so the sheet tracks the finger 1:1
    // even under the preference — deliberately: the preference is about motion
    // the interface imposes on its own, not motion the user is driving with a
    // finger, and freezing direct manipulation would read as broken rather than
    // calmer. The release below clears the override and hands the settle back to
    // the stylesheet, whose transitions the preference does collapse.
    sheet.style.transform = `translateY(${dragProgress(offset, sheet.offsetHeight) * 100}%)`
  }

  function onSheetPointerUp(event: PointerEvent): void {
    if (!drag || drag.source !== 'sheet' || event.pointerId !== drag.pointerId) return
    const offset = Math.max(event.clientY - drag.startY, 0)
    // Measured against the real release moment rather than the last recorded
    // sample, so a finger held still before lifting decays toward zero instead
    // of dismissing on however fast it was moving before it stopped.
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

  // A cancelled gesture is not a completed one, and must never reach the
  // dismiss decision. The spec does not guarantee a cancelled pointer's
  // coordinates: Chromium happens to zero them, which today makes a cancelled
  // drag's offset clamp to 0 and fall through shouldDismiss's own "offset <= 0"
  // guard by coincidence — but an engine that retained the last real
  // coordinates would hand it a positive offset and a stale velocity and
  // dismiss a gesture the browser aborted rather than one the user released. So
  // this resets the same state a release does and always springs back, on the
  // trigger as well as the sheet: a swipe cancelled by the platform must not
  // leave `drag` permanently set either.
  function onPointerCancel(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return
    const wasSheetDrag = drag.source === 'sheet'
    drag = null
    if (wasSheetDrag) resetDragVisuals()
  }

  function onTriggerClick(): void {
    // Check-and-clear in one step: a genuine follow-up tap shortly after a
    // swipe is the ordinary tap it is, not a second click to eat.
    if (swipeOpened) {
      swipeOpened = false
      return
    }
    if (isOpen) close()
    else open()
  }

  function onScrimClick(): void {
    close()
  }

  function onKeydown(event: KeyboardEvent): void {
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
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
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
  sheet.addEventListener('dragstart', preventNativeDrag)
  trigger.addEventListener('dragstart', preventNativeDrag)
  sheet.addEventListener('pointerdown', onSheetPointerDown)
  sheet.addEventListener('pointermove', onSheetPointerMove)
  sheet.addEventListener('pointerup', onSheetPointerUp)
  sheet.addEventListener('pointercancel', onPointerCancel)
  trigger.addEventListener('pointerdown', onTriggerPointerDown)
  trigger.addEventListener('pointerup', onTriggerPointerUp)
  trigger.addEventListener('pointercancel', onPointerCancel)
  window.addEventListener('scroll', onDocumentScroll, { passive: true })

  // Focusable only as the fallback an empty menu needs, and never a stop in the
  // tab sequence itself. Authored in the markup as well as set here: the markup
  // is what a page hydrating this port has to match, and the pattern still sets
  // it so that markup which authored none is not left without the fallback.
  sheet.setAttribute('tabindex', '-1')
  setOpen(false)

  // Authors list the menu most-used-first, and the most-used item has to land
  // nearest the thumb — at the bottom of the list, which in DOM terms is last.
  //
  // Reordered in the DOM rather than repainted with `flex-direction:
  // column-reverse`, because the focus order has to track the visual order
  // (WCAG 1.3.2): the trap above walks this same DOM order, so a CSS-only
  // reversal would tab through the menu bottom-to-top against what is on screen.
  //
  // append(), not replaceChildren(): every node passed is already a child of the
  // menu, so this moves them into their new order in place rather than emptying
  // the menu first — which would silently drop any non-element node (whitespace,
  // a comment) a hand-authored consumer left between the items, with nothing for
  // destroy() to hand back. `children` for the same reason: only the elements are
  // moved, so anything else stays exactly where the markup put it.
  //
  // MUI renders the menu as a plain `<ul>` of `<li>` items, and the drag handle
  // is authored as the menu's *sibling* inside the sheet, so this touches
  // nothing but the items. Emotion's server-rendered `<style>` elements do land
  // among them, which is why hoistServerRenderedStyles above runs first.
  const reordersMenu = menu.dataset.tzOrder !== 'dom'
  if (reordersMenu) menu.append(...Array.from(menu.children).reverse())

  const handle: ThumbzoneHandle = {
    open,
    close,
    destroy() {
      // Idempotent, because two owners can each hold this handle: the component
      // tears the instance down when it unmounts, and a test may already have
      // destroyed it through the published hook. Undoing an init-time DOM
      // mutation twice would put it back rather than leave it undone.
      if (destroyed) return
      destroyed = true

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
      sheet.removeEventListener('dragstart', preventNativeDrag)
      trigger.removeEventListener('dragstart', preventNativeDrag)
      sheet.removeEventListener('pointerdown', onSheetPointerDown)
      sheet.removeEventListener('pointermove', onSheetPointerMove)
      sheet.removeEventListener('pointerup', onSheetPointerUp)
      sheet.removeEventListener('pointercancel', onPointerCancel)
      trigger.removeEventListener('pointerdown', onTriggerPointerDown)
      trigger.removeEventListener('pointerup', onTriggerPointerUp)
      trigger.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('scroll', onDocumentScroll)

      // A drag or a tuck in flight at teardown must not survive it. Both are
      // written by this instance and neither has an authored default to fall
      // back to, so both are removed outright — and a stray data-tz-dragging
      // would also leave the sheet's own transition disabled, killing every
      // future open and close animation until the next drag cleared it.
      drag = null
      delete sheet.dataset.tzDragging
      clearTucked()
      // The reorder likewise has no CSS counterpart to defer to, so it is undone
      // by the same in-place move that applied it.
      if (reordersMenu) menu.append(...Array.from(menu.children).reverse())

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

      liveInstances.delete(sheet)
    },
  }

  liveInstances.set(sheet, handle)
  ownedSheets.add(sheet)
  return handle
}
