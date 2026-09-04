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
  let match2
  while ((match2 = tags.exec(html))) {
    depth += match2[0].startsWith('</') ? -1 : 1
    if (depth === 0) return html.slice(open, match2.index + match2[0].length)
  }
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
    const firstItem = menu.slice(firstItemAt, menu.indexOf('</a>', firstItemAt))

    expect((sheet.match(/<style/g) ?? []).length).toBe(0)
    expect((menu.match(/<style/g) ?? []).length).toBe(0)
    expect((firstItem.match(/<style/g) ?? []).length).toBe(0)
  })
})
