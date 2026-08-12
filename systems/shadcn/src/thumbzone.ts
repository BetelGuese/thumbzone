/**
 * The shadcn/ui port's adapter onto the shared behaviour.
 *
 * Everything the pattern *does* — the open/close lifecycle, the focus trap, the
 * pointer state machine, the thumb-first reorder, teardown — comes from
 * `core/behaviour.js`. What is left here is what a port genuinely owns:
 * validating the elements it is handed, and the ownership registry its adoption
 * design needs.
 *
 * It imports no framework, deliberately, which is what lets a server-rendered
 * page wire the pattern from a module script during load and have the island
 * adopt that instance when it hydrates. Unlike the Material UI port there is no
 * server-rendered style to hoist out of the markup first: Tailwind emits a
 * static stylesheet, so nothing of the styling system lands between the menu
 * and its items.
 *
 * Vaul is deliberately absent. Its drawer converges with this pattern on the
 * dismiss ratio and on the exact easing curve, and it implements handle-only
 * dragging natively — but its fling threshold is 0.4 against this contract's
 * 0.5, hard-coded with no way to configure it, so letting it own the drag would
 * retune a shared constant while still passing every assertion.
 */

import { createThumbzoneBehaviour } from '../../../core/behaviour.js'

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

function missingElements(refs: ThumbzoneRefs): string[] {
  return Object.entries(refs)
    .filter(([, element]) => !(element instanceof HTMLElement))
    .map(([name]) => name)
}

// A predicate rather than a cast, so a member added to the refs cannot be
// narrowed without also being checked.
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
  const elements = requireElements(refs)
  const { sheet } = elements

  if (liveInstances.has(sheet)) {
    throw new Error(
      'thumbzone: initThumbzone was already called for this sheet; call destroy() on the previous instance first',
    )
  }

  const behaviour = createThumbzoneBehaviour(elements)

  // Idempotent, because two owners can each hold this handle: the component
  // tears the instance down when it unmounts, and a test may already have
  // destroyed it through the published hook. The shared behaviour's own
  // destroy() undoes init-time DOM mutations, and undoing one twice would put
  // it back — so the latch belongs here, with the adoption design that creates
  // the second owner, rather than in behaviour shared with ports that have one.
  let destroyed = false

  const handle: ThumbzoneHandle = {
    open: behaviour.open,
    close: behaviour.close,
    destroy() {
      if (destroyed) return
      destroyed = true
      behaviour.destroy()
      liveInstances.delete(sheet)
    },
  }

  liveInstances.set(sheet, handle)
  ownedSheets.add(sheet)
  return handle
}
