import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { SHIPPED_SYSTEMS } from '../systems/registry'
import { openSheetAndSettle } from './support/sheet'
import { describeForEachSystem } from './support/systems'

/**
 * The full WCAG surface this gate holds every system to: both A and AA across
 * 2.0, 2.1 and 2.2. Not `wcag2aaa` — AAA is not a conformance target anywhere
 * else in this project, and holding a port to it here would fail on rules
 * nothing else in the suite asks for.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/**
 * `withTags([...tag])` sets axe-core's `runOnly: { type: 'tag' }`, which is
 * not the same thing as "every rule that tag matches". axe-core additionally
 * excludes any matched rule carrying its own `deprecated` or `experimental`
 * tag from *any* run, tag-scoped or not (`axe._audit.tagExclude`, checked
 * directly against 4.12.1) — the per-rule `enabled: false` default, by
 * contrast, is irrelevant here: it only governs a tag-less default run, and
 * a rule that matches a requested tag runs regardless of it. Confirmed
 * directly: `target-size` (wcag22aa's only rule) is `enabled: false` and
 * still fires a real violation under `withTags(['wcag22aa'])` alone.
 *
 * `label-content-name-mismatch` — wcag21a's *only* rule — carries axe-core's
 * `experimental` tag, so without this override wcag21a would silently run
 * zero rules while still appearing to be part of "the full WCAG 2.x A/AA
 * surface" above: exactly the silently-narrower-than-claimed gate this file
 * exists to not be. WCAG 2.5.3 (visible label text contained in the
 * accessible name) is a real, meaningful check, so it is force-enabled
 * rather than dropping wcag21a from the tag list.
 *
 * Six other rules matching the tags above hit the same deprecated/experimental
 * exclusion (aria-roledescription, audio-caption, css-orientation-lock,
 * p-as-heading, table-fake-caption, td-has-header) and are deliberately left
 * at axe-core's own default judgement: each belongs to a tag — wcag2a or
 * wcag21aa — that still has plenty of other rules running, so excluding them
 * doesn't zero out anything this gate claims to check the way losing
 * wcag21a's one rule would have.
 */
function buildAxe(page: Page): AxeBuilder {
  return new AxeBuilder({ page })
    .options({ rules: { 'label-content-name-mismatch': { enabled: true } } })
    .withTags(WCAG_TAGS)
}

/**
 * Floor for how many of the tagged rules must actually run (appear in one of
 * the four result buckets: passed, violated, incomplete, or inapplicable —
 * "inapplicable" still means axe considered the rule and found no matching
 * node, which is a real run, unlike an excluded rule that never gets that far
 * at all). A page's own content decides how many rules find a node to check,
 * but essentially the whole tagged set gets *considered* regardless of what
 * the page contains, so this floor is a check on the tag mechanism staying
 * intact, not on any one page's markup.
 */
const MIN_TOTAL_RULES_RUN = 60

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
