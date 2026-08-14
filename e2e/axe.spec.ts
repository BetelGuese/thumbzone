import { test, expect } from '@playwright/test'
import { SHIPPED_SYSTEMS } from '../systems/registry'
import { MIN_TOTAL_RULES_RUN, WCAG_TAGS, buildAxe } from './support/axe'
import { openSheetAndSettle } from './support/sheet'
import { describeForEachSystem } from './support/systems'

// Project-level, not per-system: this is a property of the installed
// axe-core and the options above, not of anything a system renders, so
// running it once per registered system would repeat identical work for an
// identical answer. It exists because the two tests below trust
// `results.violations` to mean "checked against the full WCAG 2.x A/AA
// surface" — a trust this proves against a real analyze() call rather than
// against axe's rule *registry*, which (see buildAxe above) is not the same
// thing as what a given run actually executes.
test.describe('axe tag sanity', () => {
  test('every requested tag actually runs at least one rule', async ({ page }) => {
    await page.goto(SHIPPED_SYSTEMS[0].route)
    const results = await buildAxe(page).analyze()
    const ran = [...results.passes, ...results.violations, ...results.incomplete, ...results.inapplicable]

    for (const tag of WCAG_TAGS) {
      const count = ran.filter((rule) => rule.tags.includes(tag)).length
      expect(
        count,
        `no rule tagged "${tag}" ran in a real analyze() call — a rule being registered under a tag ` +
          '(axe.getRules) is not proof it actually runs when that tag is requested: a typo silently ' +
          'contributes nothing either way, and axe-core separately excludes deprecated/experimental rules ' +
          'from a tag-scoped run even when they match',
      ).toBeGreaterThan(0)
    }

    // Guards against the tag mechanism collapsing wholesale (e.g. withTags
    // itself breaking) rather than any single tag's contribution, which the
    // per-tag loop above already checks directly.
    expect(
      ran.length,
      'the number of rules actually run for this tag set narrowed sharply — this gate is checking far less than it claims to',
    ).toBeGreaterThanOrEqual(MIN_TOTAL_RULES_RUN)
  })
})

/** One line per violation, so a failure names what axe found without paging through node-level detail. */
function summarizeViolations(results: { violations: Array<{ id: string; help: string; nodes: unknown[] }> }): string {
  return results.violations
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} node(s))`)
    .join('\n')
}

describeForEachSystem('accessibility', (system) => {
  test('has no violations with the sheet closed', async ({ page }) => {
    await page.goto(system.route)
    const results = await buildAxe(page).analyze()
    expect(results.violations, summarizeViolations(results)).toEqual([])
  })

  // The case that matters most: this is when focus is trapped, the
  // background is inert, and the sheet is a live dialog — everything the
  // closed-sheet run above cannot exercise at all.
  test('has no violations with the sheet open', async ({ page }) => {
    await page.goto(system.route)
    await openSheetAndSettle(page)
    const results = await buildAxe(page).analyze()
    expect(results.violations, summarizeViolations(results)).toEqual([])
  })
})
