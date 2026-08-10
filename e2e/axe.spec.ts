import { test, expect } from '@playwright/test'
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
 * Floor for how many rules the tags above must resolve to together.
 *
 * AxeBuilder.withTags() does not error on a tag axe-core has never heard of —
 * it just contributes zero rules, so a typo or an axe-core upgrade that
 * renames one of these silently narrows the gate instead of failing it: fewer
 * rules run, fewer things can be found, and "zero violations" quietly starts
 * meaning less than it did. Verified directly against the installed
 * axe-core (4.12.1): these five tags resolve to 70 rules between them, with
 * no overlap. The floor sits well under that so an axe-core upgrade that
 * retires a handful of individual rules doesn't make this flaky, while
 * staying far above what losing any one tag's contribution would leave.
 */
const MIN_COMBINED_RULES = 50

// Project-level, not per-system: this is a property of the installed
// axe-core, not of anything a system renders, so running it once per
// registered system would repeat identical work for an identical answer.
// It exists because the two tests below trust `results.violations` to mean
// "checked against the full WCAG 2.x A/AA surface" — a trust this proves
// rather than assumes.
test.describe('axe tag sanity', () => {
  test('every requested tag resolves to real axe-core rules', async ({ page }) => {
    await page.goto(SHIPPED_SYSTEMS[0].route)
    // analyze() is what injects axe-core onto the page; running one first
    // (and discarding its result) means the check below queries the exact
    // same axe instance — same version, same engine — that the tests after
    // it rely on, rather than a second one loaded some other way.
    await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()

    const rulesPerTag = await page.evaluate((tags: string[]) => {
      const axe = (window as unknown as { axe: { getRules: (t: string[]) => unknown[] } }).axe
      return tags.map((tag) => [tag, axe.getRules([tag]).length] as const)
    }, WCAG_TAGS)

    for (const [tag, count] of rulesPerTag) {
      expect(count, `axe-core has no rules tagged "${tag}" — it was likely renamed or dropped upstream`).toBeGreaterThan(0)
    }

    const combinedCount = await page.evaluate(
      (tags: string[]) => (window as unknown as { axe: { getRules: (t: string[]) => unknown[] } }).axe.getRules(tags).length,
      WCAG_TAGS,
    )
    expect(
      combinedCount,
      'the combined WCAG rule set narrowed sharply — this gate is checking far less than it claims to',
    ).toBeGreaterThanOrEqual(MIN_COMBINED_RULES)
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
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    expect(results.violations, summarizeViolations(results)).toEqual([])
  })

  // The case that matters most: this is when focus is trapped, the
  // background is inert, and the sheet is a live dialog — everything the
  // closed-sheet run above cannot exercise at all.
  test('has no violations with the sheet open', async ({ page }) => {
    await page.goto(system.route)
    await openSheetAndSettle(page)
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    expect(results.violations, summarizeViolations(results)).toEqual([])
  })
})
