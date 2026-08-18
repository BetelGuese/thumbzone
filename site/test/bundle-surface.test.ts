import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { bundleSurfaces } from './bundle-surface'

const BASELINE = 'site/test/bundle-surface.baseline.json'

/**
 * Pins what each utility-first bundle actually compiles.
 *
 * A utility-first scanner reads raw file text across the *whole repository* and
 * has no concept of a comment, so an ordinary English word in prose becomes a
 * real CSS rule — in every bundle, including ports that import no such
 * stylesheet. Five rules reached shipped CSS this way before anyone noticed:
 * from comment prose, from a property name, and once from a selector string
 * written inside a Playwright locator.
 *
 * Elimination is not available. `container` and `transform` are the correct
 * technical terms for what this pattern does, and both appear in `core/`'s own
 * comments and in the conformance suite — which the scanner also reads. Trying
 * to write around them makes the prose worse and the rules remain.
 *
 * So this asserts the *delta*, which the project already identified as the
 * durable half of the measurement. A change to the compiled surface is not
 * forbidden; it has to be acknowledged. Landing a port, or using a new utility,
 * legitimately moves this — update the baseline in the same commit and the diff
 * shows a reviewer exactly which rules appeared.
 */
describe('compiled utility surface', () => {
  test('every compiled class is one the baseline already accounts for', () => {
    const actual = bundleSurfaces()

    // Guards the comparison against vacuity twice over: no bundles found would
    // make every assertion below pass having compared nothing, and a port that
    // stopped linking its stylesheet would look identical to one that never
    // compiled a rule.
    expect(Object.keys(actual).length, 'no utility-first bundle was found in the build').toBeGreaterThan(0)
    for (const [port, classes] of Object.entries(actual)) {
      expect(classes.length, `${port} linked a stylesheet that compiled no class rule at all`).toBeGreaterThan(0)
    }

    if (!existsSync(BASELINE) || process.env.TZ_UPDATE_BUNDLE_BASELINE) {
      writeFileSync(BASELINE, JSON.stringify(actual, null, 2) + '\n')
    }
    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, string[]>

    for (const port of Object.keys(actual)) {
      const added = actual[port].filter((c) => !(baseline[port] ?? []).includes(c))
      const removed = (baseline[port] ?? []).filter((c) => !actual[port].includes(c))
      expect(
        { added, removed },
        `${port}'s compiled class surface changed.\n` +
          `  appeared: ${added.join(' ') || '(none)'}\n` +
          `  gone:     ${removed.join(' ') || '(none)'}\n` +
          'If a rule appeared that no element uses, a word in prose or a comment compiled into it — ' +
          'reword the prose. If the change is intended, regenerate with ' +
          'TZ_UPDATE_BUNDLE_BASELINE=1 npm test and commit the baseline alongside it.',
      ).toEqual({ added: [], removed: [] })
    }
  })
})
