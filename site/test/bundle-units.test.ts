import { describe, expect, test } from 'vitest'
import { builtStylesheets } from './bundle-surface'

/** The same shape the source guard looks for: a digit run immediately followed by `vh`. */
const BARE_VH = /\b\d+(\.\d+)?vh\b/i

/** The pattern's own surface — the elements a port hands to `core/behaviour.js`. */
const THUMBZONE_HOOK = /\[data-tz-|\.tz-/

/**
 * Closes the limitation `e2e/motion-and-units.spec.ts` records about itself.
 *
 * That guard scans a port's *source*, so it catches what a porter writes and
 * not what a porter imports. The Bootstrap port's `@import` pulls four `vh`
 * declarations out of Bootstrap and straight into the built bundle, where the
 * source scan cannot see them — inert today, because nothing uses `.offcanvas`,
 * `.vh-100` or `.min-vh-100`, but unguarded.
 *
 * The check is deliberately not "no `vh` anywhere in the build". A vendored
 * stylesheet carries rules for components nobody applies, and failing on those
 * would make the guard unpassable without forking the vendor's CSS — the kind
 * of check that gets deleted rather than satisfied. What matters is narrower and
 * is the actual hazard: `vh` resolving against iOS Safari's expanded viewport
 * height and pushing the sheet under the browser's own chrome. That can only
 * happen if the unit reaches an element this pattern owns.
 */
describe('vh in the built output', () => {
  test('the pattern tells a rule that reaches its own elements apart from a vendored one', () => {
    // The predicate itself, so a change that made it answer the same way for
    // everything cannot pass unnoticed.
    expect(THUMBZONE_HOOK.test('.tz-sheet')).toBe(true)
    expect(THUMBZONE_HOOK.test('[data-tz-sheet]')).toBe(true)
    expect(THUMBZONE_HOOK.test('.offcanvas-bottom')).toBe(false)
    expect(THUMBZONE_HOOK.test('.vh-100')).toBe(false)
  })

  test('no rule that reaches a thumbzone element sizes itself in vh', () => {
    const sheets = builtStylesheets()
    // A build that emitted no stylesheet at all would satisfy the loop below
    // while proving nothing — and so would one that found only linked files
    // and silently skipped the routes whose CSS was inlined. The byte total is
    // asserted alongside the count so that a scan of several empty strings is
    // visibly worthless rather than quietly green.
    const bytes = sheets.reduce((total, sheet) => total + sheet.css.length, 0)
    expect(sheets.length, 'the build emitted no stylesheet to scan').toBeGreaterThan(0)
    expect(bytes, `scanned ${sheets.length} stylesheets totalling ${bytes} bytes`).toBeGreaterThan(10_000)
    // The reference implementation's own rules are inlined rather than linked,
    // so their presence is what proves the inline blocks are really being read.
    expect(
      sheets.some((sheet) => sheet.css.includes('.tz-sheet')),
      'no scanned stylesheet contained the reference implementation\'s own rules — ' +
        'the inline <style> blocks are not being read',
    ).toBe(true)

    const offenders: string[] = []
    for (const { path, css } of sheets) {
      // Naive block split is enough here: a declaration cannot contain `}`, so
      // every chunk ends up as selector-plus-declarations.
      for (const block of css.split('}')) {
        const brace = block.lastIndexOf('{')
        if (brace === -1) continue
        const selector = block.slice(0, brace)
        const declarations = block.slice(brace + 1)
        if (BARE_VH.test(declarations) && THUMBZONE_HOOK.test(selector)) {
          offenders.push(`${path}: ${selector.trim().slice(0, 90)}`)
        }
      }
    }

    expect(
      offenders,
      'these built rules apply a vh length to an element the pattern owns — ' +
        'iOS Safari resolves vh against the expanded viewport height, which puts the sheet ' +
        'under the browser chrome. Use dvh. If the rule came from an imported stylesheet ' +
        'rather than from this repository, override it on the pattern\'s own selector.\n' +
        offenders.join('\n'),
    ).toEqual([])
  })
})
