/**
 * The registry of design systems thumbzone has a port for.
 *
 * The e2e conformance specs iterate `SHIPPED_SYSTEMS`, so moving an entry
 * from `PLANNED_SYSTEMS` into `SHIPPED_SYSTEMS` is the *only* edit a new port
 * needs in order to be held to the whole suite: there is no per-system spec
 * file to write, and no way to quietly opt a port out of a check. Everything
 * a port must provide for those specs to pass is documented on `System`
 * below — read it as the contributor checklist it is.
 *
 * `vanilla` is normative. The shared constants the suite asserts against
 * (dismiss ratio, fling velocity, scroll threshold, the focusable-element
 * selector) are imported from that implementation rather than restated per
 * system, so a port cannot pass conformance while quietly retuning them.
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
   * It must render the DOM contract — `data-tz-app`, `data-tz-scrim`,
   * `data-tz-sheet` (authored `inert` and `data-tz-open="false"`),
   * `data-tz-handle`, `data-tz-menu` with anchor items, and
   * `data-tz-trigger` — and expose two test hooks on `window`:
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

/** Systems awaiting a contributor port. Rendered as open cells in the matrix. */
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
