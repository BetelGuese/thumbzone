import { test, expect } from '@playwright/test'
import { PLANNED_SYSTEMS, SHIPPED_SYSTEMS } from '../systems/registry'

// Project-level, not per-system: this guards the registry that every
// conformance spec iterates. Those specs declare their tests *from* that list,
// so an empty or malformed registry does not fail them — it silently leaves
// them with nothing to declare, and the suite goes green having tested
// nothing. That failure mode is invisible from inside the conformance specs
// themselves, which is why it is checked here instead.
test.describe('systems registry', () => {
  test('ships at least one system, so the conformance specs cannot pass vacuously', () => {
    expect(SHIPPED_SYSTEMS.length).toBeGreaterThan(0)
  })

  test('every shipped entry carries what the conformance specs need', () => {
    for (const system of SHIPPED_SYSTEMS) {
      expect(system.id, 'a shipped system needs a URL-safe id').toMatch(/^[a-z0-9][a-z0-9-]*$/)
      expect(system.label.length, `${system.id} needs a label for its test group titles`).toBeGreaterThan(0)
      expect(system.route, `${system.id} needs a root-relative demo route`).toMatch(/^\//)
      // The suite compares the rendered menu against this list; an empty one
      // would make the menu-order checks pass without comparing anything.
      expect(
        system.authoredMenuOrder.length,
        `${system.id} must declare the menu items its demo route authors`,
      ).toBeGreaterThan(0)
      if (system.overflowRoute !== undefined) {
        expect(system.overflowRoute, `${system.id}'s overflowRoute must be root-relative`).toMatch(/^\//)
      }
    }
  })

  test('ids are unique, and no system is listed as both shipped and planned', () => {
    const shippedIds = SHIPPED_SYSTEMS.map((system) => system.id)
    const plannedIds = PLANNED_SYSTEMS.map((system) => system.id)
    const allIds = [...shippedIds, ...plannedIds]

    // A duplicate id is how a copy-pasted entry hides: two groups would share
    // a title, and the matrix would list the same system twice.
    expect(new Set(allIds).size, `duplicate ids in the registry: ${allIds.join(', ')}`).toBe(allIds.length)
  })
})
