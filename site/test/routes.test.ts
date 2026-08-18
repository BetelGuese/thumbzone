import { describe, expect, test } from 'vitest'
import { joinBase } from '../src/lib/routes'

/**
 * The showcase links to demo routes by their registered path — `/demo/vanilla`
 * and friends, straight out of `systems/registry.ts`. Astro does not rewrite
 * arbitrary href strings when a `base` is configured, so on a project-site
 * deployment those literals point above the base and 404, taking the switcher
 * and the framed demo with them.
 *
 * `joinBase` is what stops that, and it is unit-tested rather than left to the
 * conformance suite for a specific reason: the suite runs against a build with
 * no base at all, so every assertion it makes about a route stays green whether
 * this function is right or wrong. The only case it exercises is the identity
 * case below.
 */
describe('joinBase', () => {
  // The case every conformance run exercises, and therefore the one that
  // could rot unnoticed if it were only asserted there. Astro sets BASE_URL
  // to "/" when no base is configured; naive concatenation yields
  // "//demo/vanilla", which browsers read as a protocol-relative URL pointing
  // at a host named "demo".
  test('leaves a route untouched when the site is served from the root', () => {
    expect(joinBase('/', '/demo/vanilla')).toBe('/demo/vanilla')
  })

  test('prefixes a route when the site is served under a base', () => {
    expect(joinBase('/thumbzone/', '/demo/vanilla')).toBe('/thumbzone/demo/vanilla')
  })

  // Astro normalises BASE_URL to a trailing slash, but the value also reaches
  // this function straight from configuration in tests and scripts, and a
  // missing slash is the difference between a working link and
  // "/thumbzonedemo/vanilla" — a 404 that reads like a typo rather than a
  // path-joining bug.
  test('joins the same way whether or not the base carries a trailing slash', () => {
    expect(joinBase('/thumbzone', '/demo/vanilla')).toBe('/thumbzone/demo/vanilla')
  })

  test('never emits a doubled separator', () => {
    for (const base of ['/', '', '/thumbzone', '/thumbzone/', '/a/b/']) {
      expect(joinBase(base, '/demo/vanilla'), `base ${JSON.stringify(base)}`).not.toContain('//')
    }
  })
})
