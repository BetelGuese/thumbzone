import { test, expect, type Page } from '@playwright/test'
// The focusable-element selector comes from core so that the suite's
// definition of "focusable" and the implementations' cannot drift apart.
import { FOCUSABLE } from '../core/index.js'
import { awaitThumbzoneReady, destroyThumbzone, openThumbzone, reinitThumbzone } from './support/handles'
import { openSheetAndSettle } from './support/sheet'
import { describeForEachSystem } from './support/systems'

// Subpixel slack only. The sheet's own height is fractional on both device
// projects (a percentage of a dvh), so its edge lands a fraction of a pixel
// either side of the viewport's; anything larger than rounding is a sheet
// that is not actually anchored to the bottom.
const BOTTOM_EDGE_TOLERANCE_PX = 1

describeForEachSystem('open and close', (system) => {
  test('opens on trigger tap and reports expanded state', async ({ page }) => {
    await page.goto(system.route)
    await page.locator('[data-tz-trigger]').click()
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
    await expect(page.locator('[data-tz-trigger]')).toHaveAttribute('aria-expanded', 'true')
  })

  // Nothing else in the suite looks at where the sheet comes to rest, so a
  // top-anchored, full-height drawer — correctly reordered items, correct
  // data-tz-open, inert, focus trap, transition and touch-action — would pass
  // every other check in it while inverting the one thing the pattern is
  // arguing for. Asserted while open, which is the only state in which the
  // resting position is observable at all: closed, the sheet is deliberately
  // translated out of view.
  test('rests against the bottom edge of the viewport when open', async ({ page }) => {
    await page.goto(system.route)
    await openSheetAndSettle(page)

    const box = (await page.locator('[data-tz-sheet]').boundingBox())!
    const viewport = page.viewportSize()!
    expect(
      Math.abs(viewport.height - (box.y + box.height)),
      "the open sheet's bottom edge must meet the viewport's bottom edge",
    ).toBeLessThanOrEqual(BOTTOM_EDGE_TOLERANCE_PX)
    // Guards the premise: a sheet of zero height would satisfy the edge check
    // from anywhere on the screen, since its top and bottom edges coincide.
    expect(box.height).toBeGreaterThan(0)
  })

  // The dialog semantics are non-negotiable in this project's own
  // documentation, and axe cannot report their absence: a bare <div> with no
  // role is not a broken dialog to axe, it is not a dialog at all. So they
  // have to be asserted structurally, or a port that shipped an unlabelled
  // <div> would pass the whole suite including the accessibility gate.
  test('presents the sheet as a named modal dialog that the trigger controls', async ({ page }) => {
    await page.goto(system.route)
    const sheet = page.locator('[data-tz-sheet]')
    await expect(sheet).toHaveAttribute('role', 'dialog')
    await expect(sheet).toHaveAttribute('aria-modal', 'true')

    // The name is read while open: a closed sheet is inert, and an inert
    // subtree is excluded from the accessibility tree, so its name is not
    // computable from there.
    await openSheetAndSettle(page)
    await expect(sheet).toHaveAccessibleName(/\S/)

    // Resolved, not merely present: an aria-controls pointing at an id no
    // element carries is the same as no association at all to a screen
    // reader, and is exactly what a copied-in id or a renamed sheet leaves
    // behind.
    const controls = await page.locator('[data-tz-trigger]').getAttribute('aria-controls')
    expect(controls, 'the trigger must reference the sheet it controls').toBeTruthy()
    const resolvesToSheet = await page.evaluate(
      (id) => document.getElementById(id!) === document.querySelector('[data-tz-sheet]'),
      controls,
    )
    expect(resolvesToSheet, `aria-controls="${controls}" must resolve to the sheet itself`).toBe(true)
  })

  test('moves focus into the sheet on open', async ({ page }) => {
    await page.goto(system.route)
    await page.locator('[data-tz-trigger]').click()
    const focusedInSheet = await page.evaluate(
      () => !!document.activeElement?.closest('[data-tz-sheet]'),
    )
    expect(focusedInSheet).toBe(true)
  })

  test('makes background content inert while open', async ({ page }) => {
    await page.goto(system.route)
    await page.locator('[data-tz-trigger]').click()
    await expect(page.locator('[data-tz-app]')).toHaveAttribute('inert', '')
  })

  test('traps focus inside the sheet, cycling through every link in order', async ({ page }) => {
    await page.goto(system.route)
    await page.locator('[data-tz-trigger]').click()

    const links = page.locator('[data-tz-menu] a')
    // Derived from the rendered menu, not a hardcoded item count or names —
    // a handler that merely called preventDefault() without moving focus
    // anywhere would satisfy a weaker "still inside the sheet" check, so
    // this asserts the exact element focus lands on at every step instead.
    const linkCount = await links.count()
    // A single-link menu satisfies both the forward wrap and the backward one
    // without focus ever having to move anywhere, so a port whose demo
    // authored one item would pass this having proven nothing.
    expect(linkCount, 'the demo menu needs more than one link for a trap to be observable').toBeGreaterThan(1)

    await expect(links.first()).toBeFocused()

    // Forward through every link once; tabbing past the last one must wrap
    // back to the first — that wrap is the trap.
    for (let step = 1; step <= linkCount; step += 1) {
      await page.keyboard.press('Tab')
      await expect(links.nth(step % linkCount)).toBeFocused()
    }

    // Shift+Tab from the first link wraps backward to the last.
    await expect(links.first()).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(links.last()).toBeFocused()
  })

  // A closed sheet is fully rendered (merely translated off-screen), not
  // `hidden` — the implementation must take the sheet out of the tab order and
  // accessibility tree itself via `inert`, or its menu links stay reachable
  // by a keyboard/screen-reader user even though the sheet looks closed.
  test('keeps a closed sheet inert and out of the tab order', async ({ page }) => {
    await page.goto(system.route)

    // The attribute itself.
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('inert', '')

    // The behavioural, engine-independent proof: `inert` blocks
    // *programmatic* focus too, not just sequential Tab traversal. This is
    // the check that actually holds on every engine — WebKit does not put
    // plain `<a href>` elements without a tabindex in its native Tab
    // sequence at all (unlike Chromium and Firefox), so a keyboard sweep
    // alone cannot prove the sheet is unreachable there: it would pass
    // whether or not `inert` was applied, because WebKit already skips
    // these links on Tab regardless. Attempting to focus a link directly
    // has no such blind spot.
    await page.locator('[data-tz-menu] a').first().focus()
    await expect(page.locator('[data-tz-menu] a').first()).not.toBeFocused()

    // Belt-and-braces for engines where Tab does traverse the links:
    // sweep past every element the document could hand focus to and
    // confirm none of them land inside the sheet either. Deriving the
    // count from the page itself (rather than a literal like "6") means
    // the sweep still covers the whole tab order however large the
    // system's own fixture is.
    const focusableCount = await page.locator(FOCUSABLE).count()

    for (let i = 0; i < focusableCount + 2; i += 1) {
      await page.keyboard.press('Tab')
      const focusedInSheet = await page.evaluate(
        () => !!document.activeElement?.closest('[data-tz-sheet]'),
      )
      expect(focusedInSheet).toBe(false)
    }
  })

  test('destroy() while open releases inertRoot instead of stranding it', async ({ page }) => {
    await page.goto(system.route)
    await page.locator('[data-tz-trigger]').click()
    await expect(page.locator('[data-tz-app]')).toHaveAttribute('inert', '')

    await destroyThumbzone(page)

    await expect(page.locator('[data-tz-app]')).not.toHaveAttribute('inert', '')
    // Closing alone would blur focus to <body> with nothing to move it on,
    // since the link it was on just became inert. Tearing down from an open
    // state must hand focus back to the trigger like a normal close() does,
    // or a keyboard user loses their place entirely.
    await expect(page.locator('[data-tz-trigger]')).toBeFocused()
  })

  // `hidden` is stripped from the sheet and scrim on every state change, and
  // rightly so: a display: none sheet has nothing for the open transition to
  // animate and makes `inert` decorative. Keeping it stripped after teardown
  // is the part that is wrong — destroy() restores the pre-init DOM exactly,
  // so a consumer who authored `hidden` (a no-JS default, say) must not be
  // left with a permanently visible sheet by an instance that no longer
  // exists. No fixture can author it, since the contract forbids it as a
  // starting state, so this drives destroy()/re-init instead.
  test('destroy() restores an authored hidden attribute on the sheet and scrim', async ({ page }) => {
    await page.goto(system.route)
    const sheet = page.locator('[data-tz-sheet]')
    const scrim = page.locator('[data-tz-scrim]')

    await destroyThumbzone(page)
    await page.evaluate(() => {
      document.querySelector('[data-tz-sheet]')!.toggleAttribute('hidden', true)
      document.querySelector('[data-tz-scrim]')!.toggleAttribute('hidden', true)
    })

    await reinitThumbzone(page)
    // Guards the premise: initialisation has to have taken the attribute off
    // for its restoration to mean anything — otherwise "restored" would be
    // indistinguishable from "never touched".
    await expect(sheet).not.toHaveAttribute('hidden')
    await expect(scrim).not.toHaveAttribute('hidden')

    await destroyThumbzone(page)

    await expect(sheet).toHaveAttribute('hidden')
    await expect(scrim).toHaveAttribute('hidden')
  })

  // The sheet is focusable only as the fallback an empty menu needs, so the
  // pattern gives it tabindex="-1" at init. A port may also author that same
  // value in its own markup — a hydrating one has to, since the served markup
  // is what it must match — and teardown has to tell those two cases apart:
  // what the pattern added is its own to remove, what the markup authored is
  // not. Restoring the authored value rather than stripping the attribute is
  // what makes "destroy() restores the pre-init DOM exactly" true for a port
  // that authors one.
  //
  // Deliberately authored as "0" rather than the "-1" the pattern itself uses:
  // a distinct value is what separates "handed the authored value back" from
  // "re-added the pattern's own default", which restoring "-1" could not.
  test('destroy() restores an authored tabindex on the sheet', async ({ page }) => {
    await page.goto(system.route)
    const sheet = page.locator('[data-tz-sheet]')

    await destroyThumbzone(page)
    await page.evaluate(() => {
      document.querySelector('[data-tz-sheet]')!.setAttribute('tabindex', '0')
    })

    await reinitThumbzone(page)
    // Guards the premise, as the hidden test above does: initialisation has to
    // have taken the attribute over for its restoration to mean anything.
    // Without this, an instance that simply never touched tabindex would pass
    // the assertion below having proven nothing.
    await expect(sheet).toHaveAttribute('tabindex', '-1')

    await destroyThumbzone(page)

    await expect(sheet).toHaveAttribute('tabindex', '0')
  })

  // Every other test here interacts as soon as the DOM is there, which is the
  // right default — the pattern is supposed to work that early. But a port whose
  // demo route wires the sheet before a framework mounts over the same markup has
  // a second, later moment to survive: whatever arrives afterwards must not
  // replace the elements the published handle is holding.
  //
  // A framework doing its own hydration does exactly that if it decides the
  // served markup no longer matches what it expected: it discards its tree and
  // re-renders it, and a *new* instance then wires itself over the new nodes. The
  // page looks entirely correct afterwards — the attributes are all there, the
  // sheet opens on a tap, the menu is in thumb-first order — because the
  // replacement instance is doing all of it. What is broken is only the handle the
  // route published: it still drives the detached nodes it was given.
  //
  // So this one waits on the route's own readiness hook, which is exactly the
  // "everything that was going to arrive has arrived" signal, and only then drives
  // the handle — against the sheet the *document* currently contains, so a handle
  // pointing at a replaced node fails rather than quietly opening something nobody
  // can see. Nothing else in the suite is placed to notice: every other
  // hook-driven check either runs before a framework could have arrived or waits
  // on the same hook to avoid provoking this in the first place.
  test('the published handle still drives the live page once everything has settled', async ({ page }) => {
    await page.goto(system.route)
    await awaitThumbzoneReady(page)

    await openThumbzone(page)

    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
    // The sharper half: focus is only observable on an element the document
    // actually contains, so this cannot be satisfied by a detached sheet however
    // faithfully its attributes were updated.
    const focusedInSheet = await page.evaluate(() => !!document.activeElement?.closest('[data-tz-sheet]'))
    expect(focusedInSheet, 'open() through the published handle must focus into the rendered sheet').toBe(true)
  })

  test.describe('closing', () => {
    const closers: Array<{ name: string; act: (page: Page) => Promise<void> }> = [
      { name: 'Escape', act: (page) => page.keyboard.press('Escape') },
      {
        name: 'scrim tap',
        act: (page) => page.locator('[data-tz-scrim]').click({ position: { x: 10, y: 10 } }),
      },
      { name: 'trigger tap', act: (page) => page.locator('[data-tz-trigger]').click() },
    ]

    for (const closer of closers) {
      test(`closes on ${closer.name} and returns focus to the trigger`, async ({ page }) => {
        await page.goto(system.route)
        await page.locator('[data-tz-trigger]').click()
        await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')

        await closer.act(page)

        await expect(page.locator('[data-tz-sheet]')).not.toHaveAttribute('data-tz-open', 'true')
        await expect(page.locator('[data-tz-trigger]')).toHaveAttribute('aria-expanded', 'false')
        await expect(page.locator('[data-tz-app]')).not.toHaveAttribute('inert', '')
        await expect(page.locator('[data-tz-trigger]')).toBeFocused()

        // A sheet that has been open once must go back to being inert on
        // close, not just on first paint. The markup only authors `inert`
        // before the first open; nothing else re-applies it afterwards, so
        // this is the one place that proves the *re*-application, not just
        // the initial state.
        await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('inert', '')
        await page.locator('[data-tz-menu] a').first().focus()
        await expect(page.locator('[data-tz-menu] a').first()).not.toBeFocused()
      })
    }
  })
})

// The closed contract before hydration is only proven by never letting
// JavaScript run at all — with it enabled, Playwright's auto-retrying
// assertions simply wait for hydration and then see the JS-applied value,
// which would pass even if the authored markup itself had regressed. It is
// also the no-JS contract: this is what a user with a failed or blocked
// bundle is left with.
describeForEachSystem('closed markup, before hydration', (system) => {
  test.use({ javaScriptEnabled: false })

  test('the sheet is inert and closed straight from the served HTML', async ({ page }) => {
    await page.goto(system.route)
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('inert', '')
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'false')
  })
})
