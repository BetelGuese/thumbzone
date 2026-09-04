import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, statSync, writeFileSync, globSync } from 'node:fs'

/**
 * Builds the site once, before any test file runs, and only when the build's
 * own inputs have changed since the last build that ran through this file.
 *
 * Three test files used to build `dist` on demand when it was absent:
 * `site/test/bundle-surface.ts`'s `bundleSurfaces()` and `builtStylesheets()`,
 * and `systems/mantine/test/served-markup.test.js`'s `servedMarkup()`. Each
 * was guarded by nothing sharper than `existsSync('dist')`. Vitest runs test
 * files in separate worker processes in parallel, so a cold `npm test` raced
 * up to three concurrent `npx astro build`s against one `dist` directory —
 * two callers happening not to collide was luck, not a guarantee, and adding
 * this file's third caller turned the same pre-existing pattern into a
 * reproducible failure. A `globalSetup` module runs exactly once, in the main
 * process, before any worker is started — that is what actually serialises
 * the build rather than merely making the collision less likely.
 *
 * Existence was also the wrong question on a *warm* run: a `dist` left over
 * from before a source edit reads as fresh to `existsSync`, and every test
 * after it silently scores against the wrong build. So freshness here is a
 * hash of every file this build can read from — every port's `src/`,
 * `site/src/`, `core/` and `shared/`'s non-test files, `systems/registry.ts`
 * and `systems/contract.ts`, and the root Astro and package configs —
 * compared against the hash the current `dist` was actually built from,
 * recorded in `dist/.build-fingerprint` the moment the build that produced it
 * finished. A mismatch, same as a missing marker or a missing `dist`, means
 * rebuild; anything else is skipped, so a warm suite pays this file's cost
 * only once per set of source changes rather than once per `npm test`.
 */
export default async function buildOnce(): Promise<void> {
  const fingerprint = hashBuildInputs()
  const marker = 'dist/.build-fingerprint'

  if (existsSync(marker) && readFileSync(marker, 'utf8') === fingerprint) return

  // Rebuilt from nothing rather than overwritten in place: Astro does not
  // prune output an edit removed, so a leftover file from a deleted route or
  // a renamed asset would otherwise keep reading as current under a fresh
  // fingerprint.
  if (existsSync('dist')) rmSync('dist', { recursive: true, force: true })
  execFileSync('npx', ['astro', 'build'], { stdio: 'ignore' })
  writeFileSync(marker, fingerprint)
}

/**
 * A stable hash of every file this repository's Astro build can depend on.
 *
 * Content, not modification times: a fresh clone's checkout timestamps carry
 * no relation to the order the commits that produced the files were made in,
 * and a branch switch or a `git stash pop` can move a file's mtime backward
 * past a stale marker's own. Content is what the build actually reads, and is
 * the only thing that can tell a real edit apart from a checkout that merely
 * touched a file's timestamp without changing its bytes.
 */
function hashBuildInputs(): string {
  const roots = ['site/src/**/*', 'systems/**/*', 'core/**/*', 'shared/**/*']
  const files = new Set<string>()
  for (const root of roots) {
    for (const path of globSync(root)) {
      // Each root also matches its own test/ subtree (systems/*/test,
      // core/test, shared/test) and, within it, `**/*` matches directories as
      // well as files — neither is a build input: Astro's build never reads a
      // *.test.js, and a directory entry has no bytes of its own to hash.
      if (path.includes('/test/')) continue
      if (!statSync(path).isFile()) continue
      files.add(path)
    }
  }
  // Config a route or a port's markup, styles or adapter can all end up
  // depending on, outside every root above.
  files.add('astro.config.mjs')
  files.add('package.json')

  const hash = createHash('sha256')
  for (const path of [...files].sort()) {
    hash.update(path)
    hash.update(readFileSync(path))
  }
  return hash.digest('hex')
}
