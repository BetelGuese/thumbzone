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

/**
 * `dist` is missing under `npm test`, which is not what this file used to
 * build on demand for.
 *
 * Both exports below once called `execFileSync('npx', ['astro', 'build'], …)`
 * themselves when `dist` was absent, each guarded by nothing sharper than
 * `existsSync('dist')`. With two independent on-demand builders in this file
 * plus a third in `systems/mantine/test/served-markup.test.js`, a cold
 * `npm test` — vitest runs test files in parallel worker processes — raced up
 * to three concurrent builds against one output directory. `vitest.config.ts`
 * now points `globalSetup` at `site/test/global-setup.ts`, which builds once,
 * in the main process, before any worker starts, so `dist` is guaranteed
 * fresh by the time either export below runs. Reaching this error means that
 * guarantee did not hold — the suite was not run through `npm test`, or the
 * global setup did not complete — and silently returning `{}` or `[]` here
 * instead would be exactly the failure mode this repository names as its
 * worst: a check that cannot fail.
 */
function assertBuilt(): void {
  if (!existsSync('dist')) {
    throw new Error(
      "dist is missing. It is built once by vitest's globalSetup " +
        "(site/test/global-setup.ts) before any test file runs — run through `npm test`.",
    )
  }
}

/** A bundle is identified by the port whose route links it, not by its hashed filename. */
export function bundleSurfaces(): Record<string, string[]> {
  assertBuilt()

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

/**
 * Every stylesheet the build emitted — linked files **and** the blocks Astro
 * inlined into the HTML.
 *
 * Following `href` attributes alone is a documented trap in this repository:
 * Astro inlines a stylesheet under a size threshold, so `/demo/vanilla` and
 * `/demo/mui` link no CSS at all and a scan that reads only linked files
 * reports them clean without ever having examined them. Caught here by a
 * mutation that planted a violation in the reference stylesheet and sailed
 * through.
 */
export function builtStylesheets(): Array<{ path: string; css: string }> {
  assertBuilt()

  const sheets = globSync('dist/**/*.css').map((path) => ({ path, css: readFileSync(path, 'utf8') }))
  for (const page of globSync('dist/**/*.html')) {
    const html = readFileSync(page, 'utf8')
    for (const [index, block] of [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].entries()) {
      sheets.push({ path: `${page} (inline style #${index + 1})`, css: block[1] })
    }
  }
  return sheets
}
