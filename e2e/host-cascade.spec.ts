import { test, expect } from '@playwright/test'
// The floor comes from core rather than being restated here, so this spec and
// the ports cannot drift apart about what "big enough for a thumb" means.
import { MIN_HIT_TARGET } from '../core/index.js'
import { describeForEachSystem } from './support/systems'

/**
 * A stylesheet belonging to the page the pattern was dropped into.
 *
 * Nothing in it is adversarial in intent. Every declaration is one a real site
 * writes for its own buttons, in a file that has never heard of this pattern.
 * That is the point: the trigger has to survive a host that is merely
 * indifferent, not one that is attacking it.
 *
 * Each line earned its place by breaking a shipped port, not by seeming
 * plausible:
 *
 * - `button { width: auto; height: auto }` collapsed the Tailwind trigger to
 *   20x14 and the shadcn trigger to 24x24 — both far under MIN_HIT_TARGET,
 *   which makes it a conformance failure rather than a cosmetic one. Those
 *   two ports size the trigger with utilities, and Tailwind v4 emits
 *   utilities inside `@layer utilities`. An unlayered host rule beats a
 *   layered one at *any* specificity, so no selector those ports could have
 *   written would have held; only an important declaration reverses layer
 *   order.
 *
 * - `:focus-visible { border-radius }` squared the trigger in every port but
 *   Bootstrap. It ties with a single class on specificity and wins on source
 *   order. This is not a corner case: the pattern hands focus back to the
 *   trigger when the sheet closes, so it is what a user sees every time they
 *   close the menu — which is how it was reported.
 *
 * - `* { border-radius: 0 }` is that same hazard with the focus step removed,
 *   for the layered ports where specificity never came into it.
 *
 * Bootstrap passed all of this before any port was hardened, for a reason
 * worth keeping in view: its `rounded-circle` is one of Bootstrap's own
 * utilities, and Bootstrap writes those `!important` by convention. The fix
 * the other ports needed was the one Bootstrap already had by accident.
 */
// Written without the focus indicator that accompanies the radius in the wild.
// That indicator is not what breaks anything, and naming its property here
// would compile a dead rule into every Tailwind bundle in the repository —
// the scanner reads this file like any other, prose included.
// `site/test/bundle-surface.test.ts` is what catches that, and it caught
// exactly this, three words over.
const INDIFFERENT_HOST_STYLESHEET = `
  button { width: auto; height: auto; min-width: 0; padding: 0; position: static; }
  :focus-visible { border-radius: 2px; }
  * { border-radius: 0; }
`

/**
 * The trigger's geometry as rendered — not as authored. Rounded, because a
 * subpixel difference between two reads of an unchanged box is not what this
 * spec is about.
 */
async function triggerGeometry(page: import('@playwright/test').Page) {
  return page.locator('[data-tz-trigger]').evaluate((element) => {
    const box = element.getBoundingClientRect()
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      x: Math.round(box.x),
      y: Math.round(box.y),
      borderRadius: getComputedStyle(element).borderRadius,
    }
  })
}

describeForEachSystem('host cascade', (system) => {
  test("the trigger's geometry survives a host stylesheet that knows nothing about it", async ({
    page,
  }) => {
    await page.goto(system.route)
    const trigger = page.locator('[data-tz-trigger]')
    await expect(trigger).toBeVisible()

    // Not a claim that a trigger must be a `<button>` — the contract does not
    // say that, and this spec is not the place to add it. It is the guard that
    // stops this test passing vacuously: the host rules above are written
    // against `button`, so a port that rendered anything else would sail
    // through every assertion below without a single host declaration ever
    // reaching the element. If this ever fails, the finding is that the
    // stylesheet needs widening, not that the port is wrong.
    await expect(
      trigger,
      'the host stylesheet is written against `button`, so it must reach the trigger for this spec to mean anything',
    ).toHaveJSProperty('tagName', 'BUTTON')

    // Focused before the baseline is taken, and left focused across both
    // reads. The pattern returns focus to the trigger when the sheet closes,
    // so `:focus-visible` is the state a real user lands in — and taking both
    // measurements in it keeps the host stylesheet the only thing that
    // differs between them. Measure unfocused and the focus rule's effect
    // would be indistinguishable from the host's.
    await trigger.focus()
    const authored = await triggerGeometry(page)

    await page.addStyleTag({ content: INDIFFERENT_HOST_STYLESHEET })
    const underHostStyles = await triggerGeometry(page)

    expect(
      underHostStyles,
      'a host stylesheet must not be able to move the trigger, change its size, or reshape it',
    ).toEqual(authored)

    // Stated again as a hard floor, and deliberately not folded into the
    // comparison above. The equality check only says the host changed
    // nothing; it would hold just as happily for a port whose trigger was
    // already too small to tap. This line is the one that fails for that
    // port, and it fails naming the constant rather than a baseline.
    expect(underHostStyles.width).toBeGreaterThanOrEqual(MIN_HIT_TARGET)
    expect(underHostStyles.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET)
  })
})
