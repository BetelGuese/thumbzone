import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { describe, expect, test } from 'vitest'

/**
 * What this port's route serves, before any JavaScript runs.
 *
 * Two things are pinned here that nothing else asserts. The first is why this
 * port passes no pre-init hook: Mantine's component classes are CSS-module
 * hashes resolved at build time, so nothing of the styling system is injected
 * at the point of use, and the markup below carries none of its own `<style>`
 * elements for `shared/react/adapter.ts`'s hook to hoist out.
 * `systems/mantine/src/thumbzone.ts`'s own doc comment records this in full,
 * including which other port shares the outcome and why. An upgrade that
 * started injecting at the point of use would break this port in a way no
 * conformance instance looks for.
 *
 * The second is the contract's requirement that the sheet be fully rendered
 * while closed. The suite checks that against the rendered page; this checks
 * the bytes, which is the state the pattern is actually wired in — a module
 * script runs during load, before the island's framework arrives.
 */
const route = 'dist/demo/mantine/index.html'

function servedMarkup() {
  // Built on demand rather than skipped. A guard that quietly does nothing
  // when its input is missing is the failure mode this repository names as its
  // worst: a check that cannot fail.
  if (!existsSync(route)) execFileSync('npx', ['astro', 'build'], { stdio: 'ignore' })
  return readFileSync(route, 'utf8')
}

/**
 * The whole of the first element carrying `attribute`, found by tag depth.
 *
 * Depth, not the next closing tag: the sheet is a `<div>` containing further
 * `<div>`s, so stopping at the first `</div>` would slice off everything after
 * the drag handle — and a check that reads a fraction of the element it names
 * would go green while missing exactly what it was written to catch.
 *
 * A stated limit rather than a fixed one: this is a regex over the raw
 * string, not a parser, so a decoy element whose own attribute *value*
 * happened to contain the literal text ` data-tz-sheet=` would be matched as
 * if it carried the attribute itself. Nothing in this repository authors a
 * value shaped like that, and telling the two apart correctly needs a real
 * HTML parser rather than a tighter regex — stated here rather than chased,
 * the way `site/test/bundle-units.test.ts` states the gap between "no vh
 * reaches a thumbzone element" and "no vh anywhere in the build" instead of
 * trying to close it.
 */
function element(html, attribute) {
  // An opening tag that carries the attribute, not merely the first place its
  // name appears in the bytes. `systems/mantine/src/thumbzone.css` is a linked
  // stylesheet (`<link rel="stylesheet" href="...">`) rather than a rendered
  // `<style>` element, so none of its `[data-tz-sheet]`-shaped selectors reach
  // this markup today — but `MantineProvider` still opens the island with two
  // `<style>` elements of its own (`data-mantine-styles="true"` and
  // `="classes"`, both ahead of every element the pattern owns, and the
  // second carrying `display: none` and `@media` text for Mantine's own
  // components), and a future change that put this port's selectors back into
  // the markup must not silently start matching inside one of those instead
  // of the real element.
  const match = new RegExp(`<([a-zA-Z][a-zA-Z0-9-]*)[^<>]*\\s${attribute}[=\\s>]`).exec(html)
  if (!match) return null
  const open = match.index
  const tag = match[1]
  const tags = new RegExp(`<${tag}(?=[\\s/>])|</${tag}>`, 'g')
  tags.lastIndex = open
  let depth = 0
  let tagMatch
  while ((tagMatch = tags.exec(html))) {
    depth += tagMatch[0].startsWith('</') ? -1 : 1
    if (depth === 0) return html.slice(open, tagMatch.index + tagMatch[0].length)
  }
  // Unbalanced markup, where the target's tags never come back to zero: the
  // rest of the string is the most that can honestly be returned. The helper
  // test below pins the balanced case by equality against the exact element,
  // so this line reaching a caller is a failure there rather than a pass.
  return html.slice(open)
}

describe('the Mantine route’s served markup', () => {
  test('serves a sheet that is rendered, and neither hidden nor display:none', () => {
    const html = servedMarkup()
    // Asserted so that a route that served nothing at all — or that this test
    // read as an empty string — is visibly worthless rather than quietly green.
    expect(html.length, 'the built route is empty').toBeGreaterThan(1000)

    const sheet = element(html, 'data-tz-sheet')
    expect(sheet, 'no element carries data-tz-sheet in the served markup').not.toBeNull()

    const openingTag = sheet.slice(0, sheet.indexOf('>') + 1)
    expect(openingTag).not.toMatch(/\shidden(=|\s|>)/)
    expect(openingTag).not.toMatch(/display: ?none/)
    // The menu's items have to be in the served bytes too: the thumb-first
    // reorder happens before hydration, and it cannot reorder what is absent.
    expect((sheet.match(/<a /g) ?? []).length).toBeGreaterThan(1)
  })

  test('leaves no style element inside the sheet, the menu or the first item', () => {
    const html = servedMarkup()
    const sheet = element(html, 'data-tz-sheet')
    const menu = element(html, 'data-tz-menu')
    expect(sheet, 'no element carries data-tz-sheet').not.toBeNull()
    expect(menu, 'no element carries data-tz-menu').not.toBeNull()

    const firstItemAt = menu.indexOf('<a ')
    // Guarded like sheet and menu above: indexOf returns -1 when no anchor
    // is present, and slice(-1, -1) is "" — which would make firstItem's
    // style count pass on an empty string rather than on the item it names.
    // (The sibling test's own anchor-count assertion would still catch a
    // menu with no anchors at all, but that is a different test with a
    // different premise; this one asserts nothing on its own without this.)
    expect(firstItemAt, 'no anchor found inside the menu').not.toBe(-1)
    const firstItem = menu.slice(firstItemAt, menu.indexOf('</a>', firstItemAt))

    // Collected and asserted together rather than as three sequential
    // `expect`s. The three regions nest — firstItem sits inside menu, which
    // sits inside sheet — so a node placed anywhere below the top always
    // shows up in every wider region too. Sequential assertions would report
    // only the outermost one that failed and stop there, leaving `menu` and
    // `firstItem` unable to ever be the reported failure. One object keeps
    // the localisation those three were reaching for — a failure still names
    // which regions the stray node reached — while making every region
    // genuinely reportable instead of two of them dead weight.
    const styleCounts = {
      sheet: (sheet.match(/<style/g) ?? []).length,
      menu: (menu.match(/<style/g) ?? []).length,
      firstItem: (firstItem.match(/<style/g) ?? []).length,
    }
    expect(styleCounts).toEqual({ sheet: 0, menu: 0, firstItem: 0 })
  })

  test('element() walks past a selector decoy and spans to the matching close', () => {
    // Synthetic markup, not the build: the point is to pin element()'s own
    // contract, independently of whatever the current route happens to
    // serve. The build's two tests above cannot exercise this — thumbzone.css
    // is a linked stylesheet today, so no `[data-tz-sheet]`-shaped selector
    // reaches the served bytes to walk past (see the port's stylesheet header
    // and the note above `element` itself). That hazard was live one commit
    // ago, dormant only because the CSS moved, and nothing else here would
    // notice a regex simplification that stopped surviving it.
    //
    // Named separately from the string it sits in so the expected return can
    // be named too. `target` is the element carrying the attribute, and each
    // of its three children is there to make a different wrong strategy land
    // somewhere other than the target's own close: a same-name `<div>` (the
    // pill), whose close is the first `</div>` after the opening tag; a void
    // `<img>`, which has an open and no close at all; and a `<span>` (the
    // tail) after the pill's close. Around it, the string puts a `<style>`
    // decoy ahead of the target, a `<div class="after">` sibling behind it —
    // outside the target, inside the wrapper — and an unadorned `<p></p>`
    // past the wrapper's own close, which is there only so that a walk
    // landing on the wrapper's close and one running to the end of the
    // string report different slices instead of the same one.
    const target =
      '<div data-tz-sheet="" data-tz-open="false">' +
      '<div class="pill"></div><img class="icon" alt=""><span class="tail"></span>' +
      '</div>'
    const decoyAhead =
      '<style>[data-tz-sheet]{display:none}</style>' +
      '<div class="wrap">' +
      target +
      '<div class="after"></div>' +
      '</div>' +
      '<p></p>'

    const found = element(decoyAhead, 'data-tz-sheet')
    expect(found, 'no element carries data-tz-sheet past the decoy').not.toBeNull()
    // Equality, not a set of `toContain`s and an `endsWith`. Containment can
    // only raise a floor, and a floor is not what this test needs: the whole
    // remainder of the string past the target's opening tag contains every
    // node such assertions could name and still ends with a `</div>`, so
    // `element`'s own `return html.slice(open)` fallback — the line it
    // reaches when the tag walk never balances — satisfies all of them. One
    // equality fixes both ends of the slice at once, and the four wrong
    // landings this string is shaped to separate are each a byte away from
    // the target rather than a subset of it:
    //
    //   - the decoy `<style>` block, where a search for the attribute's name
    //     in the bytes rather than in an opening tag starts;
    //   - the pill's `</div>`, the first close after the target's opening
    //     tag, where a reader that took it for the matching one stops;
    //   - the end of the string, where the unbalanced fallback runs to,
    //     swallowing `class="after"` and the trailing `<p></p>` with it;
    //   - the *wrapper's* close, one node short of that end, where a walk
    //     counting every tag rather than only the target's own tag name
    //     lands: `<img>` is void, so its open has no close to pair with,
    //     and that walk is left one deep at the target's own close and
    //     carries on to the next place its count reaches zero. Counting
    //     only `div`s never sees the `<img>` at all, which is the whole
    //     difference between the two.
    //
    // What this does not establish is that nothing else lands here. It pins
    // where a walk ends up on one string, not across the space of ways to
    // find an element's extent, and the string exercises nothing of an
    // XHTML-style `<div/>` self-close, a tag name whose letters differ in
    // case from its closing tag's, an attribute value containing `>`, or a
    // comment holding tag-shaped text — a walk wrong only on those would
    // still pass. Stated rather than chased, the way the decoy-value limit
    // above `element` is.
    //
    // Kept clear of any word this project's utility scanner compiles, too:
    // it reads every file's raw text, comments included, so naming those
    // cases by their CSS-property vocabulary would have added a rule to a
    // bundle. `site/test/bundle-surface.test.ts` catches that, and caught
    // this comment's first draft.
    expect(found).toBe(target)

    // No element anywhere in this string carries the attribute at all.
    expect(element('<div class="pill"></div>', 'data-tz-sheet')).toBeNull()
  })
})
