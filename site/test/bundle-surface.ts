import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, globSync } from 'node:fs'

/**
 * The set of class selectors each utility-first bundle compiles, read from the
 * built output rather than from source.
 *
 * It has to be the build: Lightning CSS rewrites what the compiler emitted, and
 * this project has already written three checks against pretty output that
 * reported false failures.
 */
const CLASS_HEAD = /(?:^|[,}])\s*\.((?:[^\s.,:>+~(){}[\]\\]|\\.)+)/g

/** A bundle is identified by the port whose route links it, not by its hashed filename. */
export function bundleSurfaces(): Record<string, string[]> {
  if (!existsSync('dist')) {
    // Built on demand rather than skipped. A guard that quietly does nothing
    // when its input is missing is the failure mode this repository names as
    // its worst: a check that cannot fail.
    execFileSync('npx', ['astro', 'build'], { stdio: 'ignore' })
  }

  const surfaces: Record<string, string[]> = {}
  for (const page of globSync('dist/demo/*/index.html')) {
    const port = page.split('/')[2]
    const html = readFileSync(page, 'utf8')
    for (const [, href] of html.matchAll(/<link[^>]+href="([^"]*styles\.[^"]*\.css)"/g)) {
      const css = readFileSync(`dist${href}`, 'utf8')
      const heads = new Set<string>()
      for (const [, cls] of css.matchAll(CLASS_HEAD)) {
        // Decimal fragments of values (".32" inside a cubic-bezier) are not
        // selectors; a real utility never begins with a digit.
        if (!/^\d/.test(cls)) heads.add(cls.replace(/\\(.)/g, '$1'))
      }
      surfaces[port] = [...heads].sort()
    }
  }
  return surfaces
}
