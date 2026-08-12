/**
 * The Material UI port's adapter onto `core/behaviour.js`, which is where the
 * behaviour itself lives: opening, closing, focus, `inert`, the thumb-first
 * menu order and teardown are shared with every other system. What is left here
 * is what only this port can do — validating the elements it is handed, getting
 * Emotion's server-rendered `<style>` elements out of the pattern's markup
 * before anything reads it, and the ownership registry that lets a late mount
 * adopt an instance already running.
 *
 * It imports no framework, deliberately — see `useThumbzone` for the React
 * binding that mounts it. Framework-*agnostic* it is not: it knows what
 * rendering MUI to a string leaves in the markup (see
 * `hoistServerRenderedStyles`), which is the price of running before the
 * framework does.
 *
 * Material UI supplies none of this here, and that is a consequence of the
 * markup rather than a gap in the library. The services a porter reaches for —
 * a focus trap, Escape-to-close, a backdrop, return-focus — all belong to
 * `Modal`, not to `Drawer`, and the contract rules the `Modal`-backed temporary
 * variant out (see `ThumbzoneMenu` for why). What is left is a `Paper` rendered
 * in place, and what MUI does not supply there the shared behaviour does: the
 * trap, the key handling and the focus round trip are `core/behaviour.js`'s.
 * MUI still owns everything it can: the components, the theme, the motion
 * tokens, and the `Fab` that is a real `<button>` for the trigger to be.
 *
 * Importing no framework is what lets the pattern be live before the
 * island's framework has finished downloading: the sheet's markup is
 * server-rendered, so a page can wire it from a module script during load and
 * the component adopts that instance on mount. It is also why the pattern's
 * state lives in the DOM rather than in React state, and why this port authors
 * the contract attributes in its markup as literals rather than driving them
 * from a render:
 *
 * - The shared behaviour's `destroy()` has to hand back the DOM as the markup
 *   authored it, and be followed by an initialiser running over *whatever is
 *   there now* — consumers and the conformance suite alike edit that DOM while
 *   no instance exists (an attribute added, a node inserted between menu
 *   items). A render driven from props would overwrite those edits on its next
 *   commit; a render driven from state could not see them at all.
 * - React only touches an attribute whose prop actually changed between
 *   renders. Keeping the contract attributes as literals, never back in props,
 *   is what makes that guarantee usable here — an unrelated re-render (a
 *   ripple, a focus ring) then leaves the shared behaviour's writes alone.
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

  // Before anything reads the markup, the shared behaviour's own capture of the
  // authored state included: the hoist moves real elements out of the menu and
  // out of the first item's anchor, and the pattern must not see them there.
  hoistServerRenderedStyles([sheet, elements.scrim, elements.trigger])

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
