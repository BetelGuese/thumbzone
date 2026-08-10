import { test } from '@playwright/test'
import { SHIPPED_SYSTEMS, type System } from '../../systems/registry'

/**
 * Declares `define`'s tests once per registered system, each group titled
 * with that system's label so a failure names the system it belongs to.
 *
 * This is the whole parameterisation mechanism: a conformance spec never
 * mentions a system or a route of its own, so registering a port in
 * `SHIPPED_SYSTEMS` is what subjects it to every one of these specs.
 */
export function describeForEachSystem(title: string, define: (system: System) => void): void {
  for (const system of SHIPPED_SYSTEMS) {
    test.describe(`${title} — ${system.label}`, () => define(system))
  }
}

/**
 * Declares a group of tests that need the system's tall-menu fixture,
 * skipping the whole group — visibly, with a reason — for a system that
 * registers no `overflowRoute`.
 *
 * Registering the tests and then skipping them (rather than declaring nothing
 * at all) is deliberate: absent coverage has to show up in the report as a
 * skip against that system's name, or a port with no overflow fixture would
 * look indistinguishable from one that passed these checks.
 */
export function describeOverflowFixture(
  system: System,
  title: string,
  define: (overflowRoute: string) => void,
): void {
  test.describe(title, () => {
    test.skip(
      !system.overflowRoute,
      `${system.label} registers no overflowRoute, so its tall-menu behaviour cannot be driven.`,
    )
    // Never navigated to: the skip above has already marked every test this
    // call declares. The bogus path is there so that a Playwright change
    // which stopped honouring a group-level skip would fail these tests
    // loudly on a 404 rather than quietly run them against the short menu.
    define(system.overflowRoute ?? '/__no-overflow-fixture-registered__')
  })
}
