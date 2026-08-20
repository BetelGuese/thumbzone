/**
 * The adapter a React port wires its server-rendered markup through.
 *
 * It imports no framework, deliberately, and that is load-bearing rather than
 * tidy: the sheet's markup is server-rendered, so a page can wire the pattern
 * from a module script during load — before the island's framework has finished
 * downloading — and the component adopts that instance when it mounts. Pulling
 * React in here would drag it into that module script. The React binding lives
 * next door in `useThumbzone.ts`.
 *
 * It is also why the pattern's state lives in the DOM rather than in React
 * state, and why the ports built on this factory author the contract attributes
 * in their markup as literals rather than driving them from a render:
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
 *
 * Distinct from `shared/thumbzone-adapter.js` because the contract genuinely
 * differs, not because of the language it is written in: a framework-free port
 * refuses a second init outright, while a React port must let a late mount
 * *adopt* an instance already running. That is why there are two factories
 * rather than one with a mode flag.
 */

import { createThumbzoneBehaviour } from '../../core/behaviour.js'

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

/** The same five, once every one has been checked. */
export interface ThumbzoneElements {
  trigger: HTMLElement
  sheet: HTMLElement
  scrim: HTMLElement
  menu: HTMLElement
  inertRoot: HTMLElement
}

/** What a port built on this factory gets back. */
export interface ThumbzoneAdapter {
  initThumbzone: (refs: ThumbzoneRefs) => ThumbzoneHandle
  liveThumbzone: (sheet: Element | null) => ThumbzoneHandle | undefined
  hasThumbzoneOwner: (sheet: Element | null) => boolean
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
 * Builds a React port's initialiser and ownership queries over the shared
 * behaviour.
 *
 * @param options.beforeInit
 *   Runs against the validated elements immediately before the shared behaviour
 *   captures the authored DOM, and is the one thing measured to vary between
 *   React ports. It exists for a styling system that leaves real nodes inside
 *   the pattern's own markup when rendered to a string — Material UI's Emotion
 *   `<style>` elements — which must be out of the way before anything reads
 *   that markup. A port whose styling system emits a compiled stylesheet
 *   passes nothing.
 *
 *   Not currently covered by the conformance suite: a mutation that dropped
 *   this call entirely left every port green, because the hoisted node has no
 *   rendered box and is not focusable, so nothing in the suite notices its
 *   absence. A green suite run is not evidence a port can skip passing it.
 *
 *   Registries are created per call for the same reason the framework-free
 *   guard is: two ports never meet on one page, so sharing them would couple
 *   one port's teardown to another's with no purpose and no test covering it.
 */
export function createReactThumbzoneAdapter(
  options: { beforeInit?: (elements: ThumbzoneElements) => void } = {},
): ThumbzoneAdapter {
  const { beforeInit } = options

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
   * distinction, a component mounting over markup someone else wired would read
   * a deliberate `destroy()` as "nothing here yet" and put a replacement in
   * place that its owner never asked for.
   */
  const ownedSheets = new WeakSet<Element>()

  return {
    liveThumbzone(sheet) {
      return sheet ? liveInstances.get(sheet) : undefined
    },

    hasThumbzoneOwner(sheet) {
      return sheet ? ownedSheets.has(sheet) : false
    },

    initThumbzone(refs) {
      const elements = requireElements(refs)
      const { sheet } = elements

      if (liveInstances.has(sheet)) {
        throw new Error(
          'thumbzone: initThumbzone was already called for this sheet; call destroy() on the previous instance first',
        )
      }

      // Runs before the shared behaviour captures the authored DOM, so a port
      // can move anything its styling system left inside the pattern's markup
      // out of the way first. Material UI's own hoist is what needs this, for
      // Emotion's server-rendered style elements; a port whose styling system
      // leaves nothing behind passes nothing here.
      beforeInit?.(elements)

      const behaviour = createThumbzoneBehaviour(elements)

      // Idempotent, because two owners can each hold this handle: the component
      // tears the instance down when it unmounts, and a test may already have
      // destroyed it through the published hook. The shared behaviour's own
      // destroy() undoes init-time DOM mutations, and undoing one twice would
      // put it back — so the latch belongs here, with the adoption design that
      // creates the second owner, rather than in behaviour shared with ports
      // that have one.
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
    },
  }
}
