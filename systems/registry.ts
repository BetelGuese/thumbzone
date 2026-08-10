/**
 * The registry of design systems thumbzone has a port for.
 *
 * The e2e conformance specs iterate `SHIPPED_SYSTEMS`, so moving an entry
 * from `PLANNED_SYSTEMS` into `SHIPPED_SYSTEMS` is the *only* edit a new port
 * needs in order to be held to the whole suite: there is no per-system spec
 * file to write, and no way to quietly opt a port out of a check.
 *
 * `vanilla` is normative. The shared constants the suite asserts against
 * (dismiss ratio, fling velocity, scroll threshold, hit target, breakpoint,
 * the focusable-element selector) are imported from that implementation rather
 * than restated per system, so a port cannot pass conformance while quietly
 * retuning them. Its own exact motion and touch-action values are pinned
 * separately, as the reference point they are — a port is held to the
 * semantics, not to those numbers.
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
 *   closed, so the name does not have to.
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
 * - `destroy()` restoring the pre-init DOM exactly: attributes, menu order
 *   (including non-element nodes), and any inline transform that was there
 *   before.
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
   * two test hooks on `window`:
   * `__thumbzone` (the live handle, for `open()`/`destroy()`, which have no
   * attribute-driven equivalent a test could reach from the DOM alone) and
   * `__initThumbzone` (the initialiser itself, so a test can tear an
   * instance down and re-create it over the same elements — the only way to
   * exercise init-time-only behaviour such as the menu reorder from
   * outside the module).
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
]

/**
 * Systems awaiting a contributor port. Named here so the roadmap has one
 * source, and so the id-collision check covers them too; nothing renders them
 * yet — the showcase lists shipped systems only.
 */
export const PLANNED_SYSTEMS: readonly PlannedSystem[] = [
  { id: 'tailwind', label: 'Tailwind CSS' },
  { id: 'bootstrap', label: 'Bootstrap 5' },
  { id: 'mui', label: 'Material UI' },
  { id: 'shadcn', label: 'shadcn/ui' },
  { id: 'chakra', label: 'Chakra UI' },
  { id: 'antd', label: 'Ant Design' },
  { id: 'mantine', label: 'Mantine' },
  { id: 'radix', label: 'Radix / Ark' },
  { id: 'bulma', label: 'Bulma' },
  { id: 'vuetify', label: 'Vuetify' },
  { id: 'quasar', label: 'Quasar' },
  { id: 'ionic', label: 'Ionic' },
]
