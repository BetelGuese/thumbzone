/**
 * The registry of design systems thumbzone has a port for.
 *
 * The e2e conformance specs iterate `SHIPPED_SYSTEMS`, so moving an entry
 * from `PLANNED_SYSTEMS` into `SHIPPED_SYSTEMS` is the *only* edit a new port
 * needs in order to be held to the whole suite: there is no per-system spec
 * file to write, and no way to quietly opt a port out of a check.
 *
 * `vanilla` is normative. The behaviour itself is shared rather than restated
 * per system: `core/behaviour.js` and the two modules beside it hold the
 * lifecycle, the focus trap, the pointer state machine, the thumb-first
 * reorder and the teardown, and `core/index.js` holds the tuned constants and
 * the maths (dismiss ratio, fling velocity, scroll threshold, hit target,
 * breakpoint, the focusable-element selector). A port drives them; it does not
 * reimplement them, and it cannot quietly retune them. Vanilla's own exact
 * motion and touch-action values are pinned separately, as the reference point
 * they are — a port is held to the semantics, not to those numbers.
 *
 * The "Behaviour" section below is therefore what conformance requires, not a
 * list of what a porter must write. A port that drives the shared behaviour
 * gets all of it; the section stays stated in full because it is what
 * conformance means, and because a port is free to implement it another way so
 * long as it holds.
 *
 * ## What a port must provide
 *
 * Markup, on the demo route:
 * - `data-tz-app` around the page content the sheet covers, `data-tz-scrim`,
 *   `data-tz-sheet`, `data-tz-handle` (`aria-hidden`, a sibling of the menu,
 *   authored above it), `data-tz-menu` containing anchor items, and
 *   `data-tz-trigger` with an accessible name that names the menu.
 * - The sheet as a `role="dialog"` with `aria-modal="true"` and an accessible
 *   name of its own, and `aria-controls` on the trigger resolving to that
 *   sheet's `id`. axe reports none of these missing — an unlabelled `<div>`
 *   is not a broken dialog to it, it is not a dialog at all — so the suite
 *   asserts all four structurally.
 * - The trigger's accessible name is the port's to author, in its own words
 *   and language. The pattern names an unnamed trigger and otherwise leaves
 *   an authored name alone in both states: `aria-expanded` reports open or
 *   closed, so the name does not have to. The suite checks this directly,
 *   not just that some name exists: the fallback the pattern supplies to an
 *   unnamed trigger already reads as a name and already contains "menu", so
 *   it would otherwise pass every other check — including axe — while
 *   silently presenting an English string to a port that never authored one.
 *   A port fails conformance if the trigger's accessible name is exactly that
 *   fallback.
 * - The sheet authored `inert` and `data-tz-open="false"`, and still fully
 *   rendered while closed — moved out of view, never `hidden` or
 *   `display: none`, or there is nothing for the open transition to animate
 *   and nothing to make `inert` load-bearing.
 * - More than one menu item. Ordering, focus order and the trap are all
 *   unobservable on a menu of one, and the suite fails rather than pretending
 *   otherwise.
 *
 * Placement — the claim the whole pattern is arguing, and so the one thing a
 * port cannot reinterpret:
 * - The trigger horizontally centred, with its bottom edge inside
 *   `MAX_TRIGGER_BOTTOM_GAP` of the viewport's bottom edge. Reachability is a
 *   bounded claim: "in the lower half" would admit a trigger at 51% of the
 *   viewport height, which no thumb reaches.
 * - The open sheet's bottom edge flush with the viewport's bottom edge. A
 *   top-anchored drawer can satisfy every other line in this contract, which
 *   is exactly why this one is stated and asserted.
 * - The open sheet reserving the trigger's own vertical footprint at its bottom
 *   edge, so the menu's last row is never underneath it. The trigger floats
 *   *above* the sheet because tapping it is a close path and it has to stay
 *   hit-testable there — which makes "floating above" and "covering the last
 *   row" the same arrangement unless the sheet reserves the space. Asserted on
 *   the rendered geometry, and against a scrolled-to-the-end overflowing menu
 *   too where a port registers one: that is the position where the overlap is
 *   visible, and the one a short fixture cannot reach.
 *
 * Behaviour:
 * - `data-tz-open` on sheet and scrim, `aria-expanded` on the trigger,
 *   `inert` moving between `data-tz-app` and the sheet, focus into the sheet
 *   on open and back to the trigger on every close path (trigger, scrim,
 *   Escape), and a focus trap that owns Tab in both directions.
 * - `data-tz-tucked` on the trigger while a downward document scroll is in
 *   effect, cleared while the sheet is open and at the end of the document.
 * - Thumb-first menu order — the menu's items reordered in the DOM itself,
 *   not merely re-painted there, with `data-tz-order="dom"` on the menu
 *   opting out. The suite's positive control re-initialises over the same
 *   markup with the opt-out absent and asserts the rendered order actually
 *   changed, so a CSS-only port (`flex-direction: column-reverse` and
 *   nothing else) fails conformance: focus order has to track visual order
 *   (WCAG 1.3.2), and that only holds if the reorder is real.
 * - Drag-to-dismiss and swipe-to-open driven by Pointer Events with pointer
 *   capture on the sheet, tracking the finger through an inline `transform`
 *   on the sheet and marking `data-tz-dragging` while in flight. The menu is
 *   the scroll container, and no drag may begin inside it.
 * - `destroy()` restoring the pre-init DOM exactly: attributes (an authored
 *   accessible name, an authored `hidden` and the sheet's own authored
 *   `tabindex` included, and anything the pattern added itself removed
 *   again), menu order (including non-element nodes), and any inline
 *   transform that was there before.
 * - The handle the route published still driving the page once everything has
 *   settled — asserted for every system, not just the ones with a framework in
 *   them. A port whose markup something else adopts after load can end up with
 *   the published handle on elements that were replaced, and the failure is
 *   invisible from the page's behaviour: the replacement drives the live UI
 *   perfectly while `__thumbzone` talks to detached nodes. Nothing else in the
 *   suite is positioned to catch that, so this is stated here as the requirement
 *   it is rather than left as an implementation note against one port.
 *
 * Motion and touch:
 * - The sheet's travel declared as a CSS transition on `transform`, within the
 *   bounds in `e2e/support/motion.ts` and on a non-linear curve.
 * - Under `prefers-reduced-motion`, no travel at all (opacity only) and every
 *   transition on the sheet collapsed to effectively instant.
 * - `touch-action` on the handle, sheet, scrim and trigger that refuses a
 *   vertical pan, and on the menu that permits one at every scroll position.
 *   The scrim additionally must keep pinch-zoom available (WCAG 1.4.4): it
 *   covers the full viewport while the sheet is open, so blocking zoom there
 *   is a screen-wide regression, not a local one. The handle is held only to
 *   the panning requirement — the same trade-off confined to one 48px
 *   control is a negligible impairment, and the handle genuinely needs to
 *   own the gesture — so `touch-action: none` remains a legitimate choice
 *   there but not on the scrim.
 */

export interface System {
  /** URL-safe identifier. Matches the demo route's own path segment. */
  readonly id: string
  /**
   * Human-readable name. Also the suffix on every conformance group's title,
   * so it is what identifies a failure as this system's in test output.
   */
  readonly label: string
  /**
   * Route serving the standalone demo the conformance suite drives.
   *
   * It must meet everything under "What a port must provide" above, and expose
   * three test hooks on `window`:
   *
   * - `__thumbzone` — the live handle, for `open()`/`destroy()`, which have no
   *   attribute-driven equivalent a test could reach from the DOM alone.
   * - `__initThumbzone` — the initialiser itself, so a test can tear an instance
   *   down and re-create it over the same elements: the only way to exercise
   *   init-time-only behaviour such as the menu reorder from outside the module.
   * - `__thumbzoneReady` — a promise that resolves once the route's instance is
   *   wired *and* anything arriving after it has finished with the same markup.
   *   For a route where nothing arrives later this is `Promise.resolve()`, and
   *   that is the *only* case it is correct for: a route where something does
   *   arrive later and reaches for it anyway is not caught by the suite in the
   *   act, because the awaited promise still resolves and every assertion after
   *   it still runs — the violation this hides is the same dead-handle-behind-
   *   a-live-UI failure the hook exists to prevent, and it resurfaces later as
   *   an intermittent flake rather than the clean failure a genuine readiness
   *   promise would produce. It is published all the same either way, so the
   *   suite never has to ask which systems have one — and published no later
   *   than the document's own `load` event, the one `page.goto` resolves on: a
   *   route that only assigns it from inside an async chunk, rather than from a
   *   synchronous script that runs before `load`, can lose that race and throw
   *   the suite's "must expose" error against a port that was never actually
   *   missing the hook, only late publishing it.
   *
   *   It exists for the ports that need it, and the need is not hypothetical.
   *   A port built on a framework that hydrates server-rendered markup has two
   *   parties claiming the same DOM: the pattern, wired during load so the sheet
   *   works the moment the document reports itself loaded, and the framework,
   *   arriving later to adopt the markup it rendered. The thumb-first reorder is
   *   what they collide over, in two separate ways — and this hook answers only
   *   the second of them. A port that implements the hook perfectly and skips the
   *   first still fails.
   *
   *   **The order the framework renders.** The reorder runs at init, so on a
   *   server-rendered page the served menu is *already* thumb-first before the
   *   framework looks at it — while the component still describes the authored
   *   order. Every item's label is then held against the wrong node, off by the
   *   length of the list. Reordering moves text between nodes without moving any
   *   element the framework expects, so this surfaces as exactly one kind of
   *   mismatch: text. Do not assume a mismatch is a warning. React *throws* on an
   *   unannounced text mismatch and answers by discarding the tree and rendering
   *   a fresh one — replacing the elements `__thumbzone` is holding, which is the
   *   same dead-handle failure described below, arriving by a different route.
   *   Two mitigations, and the first is the one that does the work:
   *
   *   - **Render the order the DOM already has.** Ask the DOM once, on the render
   *     that has to agree with the page, and trust the answer only when it is
   *     unambiguous — an exact reversal of the items that render was given.
   *     Anything else (a menu that opted out with `data-tz-order="dom"`, a
   *     consumer's own order, markup the component did not produce, or a
   *     client-only render with no server markup to consult) reads as "not
   *     reordered" and renders the authored order, which is also what the server
   *     rendered. Capture the *direction* once rather than recomputing it, or a
   *     later re-render lets the framework write the order back — the wrong way
   *     round, since the order is the pattern's.
   *   - **Annotate the moved text, on the node whose text moved.** A framework
   *     consults its suppression flag at the fiber the mismatch is found at and
   *     nowhere else, so annotating the menu several levels up does nothing. This
   *     covers only the residue the point above cannot: a served order that is
   *     neither the authored one nor an exact reversal, where the render falls
   *     back to the authored order and some text genuinely differs. On its own it
   *     silences the report while leaving every label bound to the wrong node,
   *     which is silent rather than safe — it is never a substitute for
   *     rendering the DOM's own order.
   *
   *   **When the reorder happens.** This is what the hook is for. Hydration walks
   *   the menu's items as siblings and holds a pointer into that list across the
   *   tasks it yields between — so the *first* reorder, which happens before the
   *   framework can have started, is safe, while a later one is not: landing
   *   mid-hydration it leaves the framework short of the nodes it still expects,
   *   and the framework answers by discarding its tree and re-rendering it. That
   *   replaces the elements `__thumbzone` is holding, and no annotation reaches
   *   it — a node that *moved* is not a text mismatch anything can suppress. The
   *   page still works, because the replacement wires itself over the new nodes —
   *   which is what makes it worth a contract hook rather than a comment: the
   *   symptom is a dead handle behind a live UI, and no assertion about the
   *   page's behaviour reveals it.
   *
   *   The suite awaits this before every hook-driven `destroy()` and re-init,
   *   which are the only things that reorder the menu after load. A porter using
   *   such a framework has to resolve it from something that genuinely runs after
   *   the framework has committed — an effect, typically. Island markers report
   *   when hydration was *scheduled*, and timers, microtasks and animation frames
   *   all run between the framework's own tasks, so none of those is a barrier.
   */
  readonly route: string
  /**
   * The menu items `route` authors, in source order — i.e. before the
   * thumb-first reorder runs at init.
   *
   * The suite uses this as an independent source of truth: checking that
   * `destroy()` restored the authored order by reversing whatever the page
   * currently renders would only prove the teardown inverts the reorder,
   * which holds even when the reorder itself is wrong.
   */
  readonly authoredMenuOrder: readonly string[]
  /**
   * Optional route serving the same system with a menu taller than the
   * sheet, for the coverage that only exists once the menu is a scroll
   * container of its own: touch-scrolling inside it, and the handle staying
   * the only place a dismiss drag can start.
   *
   * Needs the same DOM contract as `route`, but none of its test hooks — the
   * tests that use this fixture drive it entirely through real input.
   *
   * A port may ship without one; those tests then report as skipped for that
   * system rather than passing silently.
   */
  readonly overflowRoute?: string
}

/** A system awaiting a contributor port: named, but with nothing to test yet. */
export type PlannedSystem = Pick<System, 'id' | 'label'>

/** Systems with a shipped implementation, held to the conformance suite. */
export const SHIPPED_SYSTEMS: readonly System[] = [
  {
    id: 'vanilla',
    label: 'Vanilla',
    route: '/demo/vanilla',
    authoredMenuOrder: ['Home', 'Search', 'Library', 'Profile', 'Settings'],
    overflowRoute: '/demo/vanilla-overflow',
  },
  {
    id: 'mui',
    label: 'Material UI',
    route: '/demo/mui',
    authoredMenuOrder: ['Home', 'Search', 'Library', 'Profile', 'Settings'],
    overflowRoute: '/demo/mui-overflow',
  },
  {
    id: 'shadcn',
    label: 'shadcn/ui',
    route: '/demo/shadcn',
    authoredMenuOrder: ['Home', 'Search', 'Library', 'Profile', 'Settings'],
    overflowRoute: '/demo/shadcn-overflow',
  },
  {
    id: 'tailwind',
    label: 'Tailwind CSS',
    route: '/demo/tailwind',
    authoredMenuOrder: ['Home', 'Search', 'Library', 'Profile', 'Settings'],
    overflowRoute: '/demo/tailwind-overflow',
  },
  {
    id: 'bootstrap',
    label: 'Bootstrap 5',
    route: '/demo/bootstrap',
    authoredMenuOrder: ['Home', 'Search', 'Library', 'Profile', 'Settings'],
    overflowRoute: '/demo/bootstrap-overflow',
  },
  {
    id: 'chakra',
    label: 'Chakra UI',
    route: '/demo/chakra',
    authoredMenuOrder: ['Home', 'Search', 'Library', 'Profile', 'Settings'],
    overflowRoute: '/demo/chakra-overflow',
  },
]

/**
 * Systems awaiting a contributor port. Named here so the roadmap has one
 * source, and so the id-collision check covers them too; nothing renders them
 * yet — the showcase lists shipped systems only.
 */
export const PLANNED_SYSTEMS: readonly PlannedSystem[] = [
  { id: 'antd', label: 'Ant Design' },
  { id: 'mantine', label: 'Mantine' },
  { id: 'radix', label: 'Radix / Ark' },
  { id: 'bulma', label: 'Bulma' },
  { id: 'vuetify', label: 'Vuetify' },
  { id: 'quasar', label: 'Quasar' },
  { id: 'ionic', label: 'Ionic' },
]
