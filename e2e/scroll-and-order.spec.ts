import { test, expect } from '@playwright/test'
// The jitter threshold comes from core, so the scenarios below stay derived
// from the value every system must honour.
import { SCROLL_THRESHOLD } from '../core/index.js'
import { destroyThumbzone, openThumbzone, reinitThumbzone } from './support/handles'
import { scrollAndSettle, scrollDocument } from './support/scroll'
import { openSheetAndSettle } from './support/sheet'
import { describeForEachSystem, describeOverflowFixture } from './support/systems'

// A wide margin above the jitter threshold, derived from the exported
// constant rather than a bare literal, so these scenarios keep meaning
// "comfortably past the threshold" if it's ever retuned — a bare 400 would
// silently stop meaning that (and one of these tests would false-pass by
// never tucking at all) the moment SCROLL_THRESHOLD crossed it.
const SCROLL_DOWN_PAST_THRESHOLD = SCROLL_THRESHOLD * 50
const SCROLL_UP_PAST_THRESHOLD = SCROLL_THRESHOLD * 25
// A second, smaller nudge past the threshold, used only for a scroll that
// must land mid-document rather than at its end — a demo's scrollable range
// is nowhere near two lots of SCROLL_DOWN_PAST_THRESHOLD, and landing on the
// document's actual end would trigger the tracker's own "always show at the
// end" rule for a reason that has nothing to do with whatever this scroll is
// meant to test.
const SCROLL_NUDGE = SCROLL_THRESHOLD * 10

describeForEachSystem('scroll-aware trigger', (system) => {
  test('tucks away on scroll down and returns on scroll up', async ({ page, browserName }) => {
    await page.goto(system.route)
    const trigger = page.locator('[data-tz-trigger]')

    await scrollDocument(page, browserName, SCROLL_DOWN_PAST_THRESHOLD)
    await expect(trigger).toHaveAttribute('data-tz-tucked', 'true')

    await scrollDocument(page, browserName, -SCROLL_UP_PAST_THRESHOLD)
    await expect(trigger).not.toHaveAttribute('data-tz-tucked', 'true')
  })

  test('is always visible at the end of the document', async ({ page }) => {
    await page.goto(system.route)
    await scrollAndSettle(page, () => page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)))
    await expect(page.locator('[data-tz-trigger]')).not.toHaveAttribute('data-tz-tucked', 'true')
  })

  // The trigger and an open sheet never compete for the thumb's reach at
  // once, so tucking must both clear on open and stay cleared for any scroll
  // that arrives while the sheet is still open.
  test('never tucks while the sheet is open, even if a scroll arrives', async ({ page, browserName }) => {
    await page.goto(system.route)
    const trigger = page.locator('[data-tz-trigger]')

    // Get it tucked first, so what's under test is genuinely "cleared on
    // open" rather than "never got set in the first place" — starting from
    // an already-untucked trigger could not tell the two apart.
    await scrollDocument(page, browserName, SCROLL_DOWN_PAST_THRESHOLD)
    await expect(trigger).toHaveAttribute('data-tz-tucked', 'true')

    // Driven through the open() handle directly, not a tap on the trigger:
    // fully tucked is translated off-screen by design, so a real click
    // there is not something a genuine user gesture could deliver either —
    // open()'s own promise to clear the tucked state does not depend on
    // which input path called it.
    await openThumbzone(page)
    await expect(page.locator('[data-tz-sheet]')).toHaveAttribute('data-tz-open', 'true')
    await expect(trigger).not.toHaveAttribute('data-tz-tucked', 'true')

    // A small nudge, not another full SCROLL_DOWN_PAST_THRESHOLD: the
    // document is already close to the bottom of its scroll range from the
    // first scroll above, and landing exactly on the document's end would
    // trigger "always show" regardless of the open check this is meant to
    // isolate.
    await scrollDocument(page, browserName, SCROLL_NUDGE)
    await expect(trigger).not.toHaveAttribute('data-tz-tucked', 'true')
  })

  // The menu, not the sheet, is the scroll container — its own overflow
  // scrolling must be a completely separate signal from document scroll, or
  // an overflowing menu would tuck the trigger the instant a user reads
  // through it.
  describeOverflowFixture(system, 'overflowing menu', (overflowRoute) => {
    // Scrolled with the sheet *closed*. Tucking is suppressed outright while
    // the sheet is open (the test above is what proves that), so a menu
    // scrolled from an open sheet could never tuck the trigger whatever the
    // implementation did with the event — the isolation this test is named
    // for would be indistinguishable from that suppression. Closed, the
    // trigger is genuinely tuckable, and only the fact that the menu's own
    // scrolling never reaches the tucking logic keeps it untucked.
    test('does not tuck when the overflowing menu itself is scrolled', async ({ page }) => {
      await page.goto(overflowRoute)
      const trigger = page.locator('[data-tz-trigger]')
      await expect(trigger).not.toHaveAttribute('data-tz-tucked', 'true')

      const menu = page.locator('[data-tz-menu]')
      // Downward, comfortably past the jitter threshold but well short of the
      // menu's own end: at the end, a tracker fed this scroll by mistake
      // would answer "show" for its own end-of-content reason and mask the
      // very confusion this is looking for.
      await menu.evaluate((el, distance) => {
        el.scrollTop = distance
        el.dispatchEvent(new Event('scroll'))
      }, SCROLL_NUDGE)
      // Guards the premise: this only proves the trigger's isolation from
      // menu-scrolling if the menu actually scrolled.
      expect(await menu.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
      // The dispatch above is synchronous and already handled by the time
      // evaluate() resolves — this is a settle point for consistency with
      // every other scripted scroll in this file, not because this one has
      // shown any timing sensitivity of its own.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

      await expect(trigger).not.toHaveAttribute('data-tz-tucked', 'true')
    })
  })
})

describeForEachSystem('menu order', (system) => {
  test('renders the first authored item nearest the thumb', async ({ page }) => {
    await page.goto(system.route)
    await openSheetAndSettle(page)

    const links = page.locator('[data-tz-menu] a')
    const count = await links.count()
    // With one item, "lowest on screen" is also the highest: nothing about
    // thumb-first ordering would be under test.
    expect(count, 'the demo menu needs more than one link for its order to be observable').toBeGreaterThan(1)
    const boxes = await Promise.all(
      Array.from({ length: count }, (_, i) => links.nth(i).boundingBox()),
    )
    const allYs = boxes.map((b) => b!.y)

    // The registry's first authored item must sit exactly lowest on screen —
    // the list's maximum y, not merely below at least one other item (which
    // a partial shuffle, not a full reversal, could also satisfy without
    // actually being thumb-first).
    const [firstAuthored] = system.authoredMenuOrder
    const renderedIndex = (await links.allTextContents()).indexOf(firstAuthored)
    // Guards the premise: a registry entry whose authoredMenuOrder does not
    // match what the route renders would otherwise index nothing and fail
    // for a misleading reason.
    expect(renderedIndex, `the menu must render its first authored item, "${firstAuthored}"`).toBeGreaterThanOrEqual(0)
    expect(allYs[renderedIndex]).toBe(Math.max(...allYs))
  })

  // The focus trap owns Tab cycling itself (WebKit omits plain <a href>
  // elements from native tab order entirely), and opening auto-focuses the
  // first link. Pressing Tab exactly `count` times from there would walk
  // through every remaining link and then wrap the trap back to that same
  // first (topmost) link — appending its low y-value at the end of the
  // sequence, which would make even a fully correct,
  // monotonically-increasing focus order fail this assertion for a reason
  // that has nothing to do with WCAG 1.3.2. Reading the initial focus target
  // directly and then tabbing one short of a full cycle visits every link
  // exactly once, in order, with no wrap.
  test('keeps focus order matching visual order', async ({ page }) => {
    await page.goto(system.route)
    await openSheetAndSettle(page)

    const links = page.locator('[data-tz-menu] a')
    const count = await links.count()
    // The monotonicity check below compares consecutive pairs, so a one-item
    // menu would leave it with no pair to compare and pass vacuously.
    expect(count, 'the demo menu needs more than one link for a focus order to exist').toBeGreaterThan(1)
    const ys: number[] = [await page.evaluate(() => document.activeElement!.getBoundingClientRect().y)]
    for (let i = 1; i < count; i += 1) {
      await page.keyboard.press('Tab')
      ys.push(await page.evaluate(() => document.activeElement!.getBoundingClientRect().y))
    }
    // Strictly increasing, not "already equal to its own sorted self": a
    // stalled trap — Tab never advancing focus, activeElement stuck on the
    // first link — produces a constant array, which is trivially already
    // sorted and would pass a same-as-sorted check without ever proving
    // focus moved at all. That is the single most valuable regression this
    // test exists to catch, since the implementation owns Tab cycling rather
    // than trusting native order.
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i]).toBeGreaterThan(ys[i - 1])
    }
  })

  // The reorder must trust that the menu's children are all real list items —
  // the drag handle is authored as the menu's sibling inside the sheet, not
  // one of its children, but that structural assumption is exactly the kind
  // of thing worth checking directly rather than trusting.
  test('does not reorder or drop the drag handle', async ({ page }) => {
    await page.goto(system.route)

    const handleIsMenuChild = await page.evaluate(() => {
      const menu = document.querySelector('[data-tz-menu]')!
      const handle = document.querySelector('[data-tz-handle]')!
      return Array.from(menu.children).includes(handle)
    })
    expect(handleIsMenuChild).toBe(false)

    await openSheetAndSettle(page)

    const handle = page.locator('[data-tz-handle]')
    await expect(handle).toBeAttached()
    await expect(handle).toHaveAttribute('aria-hidden', 'true')

    // Still authored above the menu inside the sheet, regardless of how the
    // menu's own items got reordered.
    const handleBox = (await handle.boundingBox())!
    const menuBox = (await page.locator('[data-tz-menu]').boundingBox())!
    expect(handleBox.y + handleBox.height).toBeLessThanOrEqual(menuBox.y + 1)
  })

  // The opt-out has to actually be wired up, not just documented. No fixture
  // route is authored with the attribute already set — the reorder runs once,
  // synchronously, at init — so this drives it through the same
  // destroy()/re-init hooks used to exercise other init-time-only behaviour.
  test('data-tz-order="dom" opts out of the reorder', async ({ page }) => {
    await page.goto(system.route)
    const links = page.locator('[data-tz-menu] a')

    await destroyThumbzone(page)
    await page.evaluate(() => {
      document.querySelector('[data-tz-menu]')!.setAttribute('data-tz-order', 'dom')
    })
    await reinitThumbzone(page)

    expect(await links.allTextContents()).toEqual([...system.authoredMenuOrder])

    // The positive control. Everything above is equally satisfied by an
    // initialiser that reorders nothing under any circumstances — the opt-out
    // only means something if the same re-initialisation *does* reorder when
    // the attribute is absent. Run second, on the same page, so the two halves
    // differ by nothing but the attribute.
    await destroyThumbzone(page)
    await page.evaluate(() => {
      document.querySelector('[data-tz-menu]')!.removeAttribute('data-tz-order')
    })
    await reinitThumbzone(page)

    const reordered = await links.allTextContents()
    expect(reordered).not.toEqual([...system.authoredMenuOrder])
    // Stated as thumb-first rather than as a reversal: what the pattern
    // promises is that the first authored item ends up nearest the thumb,
    // which in DOM terms is last.
    expect(reordered[reordered.length - 1]).toBe(system.authoredMenuOrder[0])
  })

  // destroy() must fully restore the pre-init DOM state, and the reorder has
  // no CSS counterpart to fall back to, so leaving it in place after teardown
  // would mean a destroyed instance and a never-initialised page no longer
  // look alike. Checked against the registry's authored order (the
  // independent source of truth), not against a reversal of whatever is
  // currently rendered — the latter would only prove destroy() inverts a
  // reverse, which holds even if the reorder that ran at init was itself
  // wrong.
  test('destroy() restores the pre-reorder menu order', async ({ page }) => {
    await page.goto(system.route)

    await destroyThumbzone(page)

    const restoredTexts = await page.locator('[data-tz-menu] a').allTextContents()
    expect(restoredTexts).toEqual([...system.authoredMenuOrder])
  })

  // Same constraint, and appending (rather than replacing children outright)
  // is specifically what makes it possible: a non-element node authored
  // between list items — whitespace or a comment, common in hand-written
  // markup even though this project's own fixtures happen not to have any —
  // must survive the init reorder and the destroy() restoration alike.
  //
  // The node is put in place before an instance exists and then re-initialised
  // over, rather than added to the running page: added afterwards it would only
  // ever meet the teardown reorder, leaving the init half of that claim
  // untested — and init is the reorder a consumer's markup actually meets
  // first.
  test('keeps non-element nodes in the menu through both the init reorder and destroy()', async ({ page }) => {
    await page.goto(system.route)
    const commentCount = () =>
      page.evaluate(
        () =>
          Array.from(document.querySelector('[data-tz-menu]')!.childNodes).filter(
            (n) => n.nodeType === Node.COMMENT_NODE,
          ).length,
      )

    await destroyThumbzone(page)
    // Between two list items, which is where hand-authored markup puts one,
    // and the position a reorder that rebuilt the child list would lose.
    await page.evaluate(() => {
      const menu = document.querySelector('[data-tz-menu]')!
      menu.insertBefore(document.createComment('marker'), menu.children[1])
    })
    await reinitThumbzone(page)

    // Counted, not merely detected: the reorder moves every child it is given,
    // so a node handed back twice is as much a failure to restore the authored
    // markup as one dropped altogether.
    expect(await commentCount(), 'the init reorder must not drop or duplicate a non-element node').toBe(1)

    await destroyThumbzone(page)

    expect(await commentCount(), 'destroy() must not drop or duplicate a non-element node').toBe(1)
  })

  // Same constraint, for the other DOM mutation the scroll-aware trigger
  // makes: data-tz-tucked has no authored default either, so a destroyed
  // instance must not leave it behind.
  test('destroy() clears any tucked state left on the trigger', async ({ page, browserName }) => {
    await page.goto(system.route)
    const trigger = page.locator('[data-tz-trigger]')
    await scrollDocument(page, browserName, SCROLL_DOWN_PAST_THRESHOLD)
    await expect(trigger).toHaveAttribute('data-tz-tucked', 'true')

    await destroyThumbzone(page)

    await expect(trigger).not.toHaveAttribute('data-tz-tucked', 'true')
  })
})
