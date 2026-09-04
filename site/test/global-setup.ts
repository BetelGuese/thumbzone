import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, globSync } from 'node:fs'

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
 * hash of this repository's own files — everything but a named set of
 * exclusions `hashBuildInputs()` states and justifies one by one — compared
 * against the hash the current `dist` was actually built from, recorded in
 * `dist/.build-fingerprint` the moment the build that produced it finished. A
 * mismatch, same as a missing marker or a missing `dist`, means rebuild;
 * anything else is skipped, so a warm suite pays this file's cost only once
 * per set of source changes rather than once per `npm test`.
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
 * A stable hash of this repository's files, whatever their extension and
 * wherever in the tree they sit.
 *
 * The whole repository rather than a list of source directories, because that
 * is what the build reads. Neither Tailwind stylesheet here carries an
 * `@source` directive, so the Oxide scanner running inside the Astro build
 * walks out from the stylesheet's project root, and a bare token in any file
 * it reaches compiles a real utility into two ports' CSS bundles — which
 * `site/test/bundle-surface.test.ts` then scores. A comment is enough to do
 * it: `systems/mantine/test/served-markup.test.js` and
 * `systems/mantine/src/ThumbzoneMenu.tsx` each record having moved that
 * pinned surface from prose alone. An earlier version of this hash covered
 * four source directories and skipped every `test` subtree under them, on the
 * reasoning that Astro's build never reads a test file — true of Astro, and
 * false of the scanner inside its build. That left the exact hole this file
 * exists to close: a warm run after editing a comment in a test file scored
 * the bundle surface against a stale build and passed.
 *
 * What is left out, each for its own reason, and why the fingerprint can
 * still match twice:
 *
 * - `dist`, which this build writes, the fingerprint marker inside it
 *   included; and the ignored directories a test run writes —
 *   `test-results`, `playwright-report`, `coverage`. A hash covering what the
 *   build and the suite produce could never agree with itself twice.
 * - `node_modules`, which is not this repository's source. A dependency
 *   change reaches the hash through `package-lock.json` instead, and that is
 *   hashed.
 * - Every hidden entry. `.git` and Astro's own `.astro` cache are in there:
 *   the first changes with every git operation, the second is written by the
 *   build, and a hash over either could not agree with itself twice. The rest
 *   of that exclusion is a deliberate gap rather than a claim about the
 *   scanner's reach — it does walk hidden directories, `.git` excepted, both
 *   established by planting a token in one and seeing whether it compiled —
 *   so a utility word appearing only in, say, a workflow file under `.github`
 *   would move the bundle surface without moving this hash. Nothing baselined
 *   comes from there and CI builds cold, so the trade is a stable fingerprint
 *   against a narrow blind spot named here rather than papered over.
 *
 * Nothing else is filtered, so a file added at the top level, or a directory
 * of a kind this repository does not have yet, is covered the day it lands
 * rather than when somebody remembers to widen a list.
 *
 * Content, not modification times: a fresh clone's checkout timestamps carry
 * no relation to the order the commits that produced the files were made in,
 * and a branch switch or a `git stash pop` can move a file's mtime backward
 * past a stale marker's own. Content is what the build actually reads, and is
 * the only thing that can tell a real edit apart from a checkout that merely
 * touched a file's timestamp without changing its bytes.
 */
function hashBuildInputs(): string {
  const excluded = new Set([
    'dist',
    'node_modules',
    'test-results',
    'playwright-report',
    'coverage',
  ])
  const files = new Set<string>()
  for (const entry of readdirSync('.', { withFileTypes: true })) {
    if (entry.name.startsWith('.') || excluded.has(entry.name)) continue
    if (entry.isFile()) {
      files.add(entry.name)
      continue
    }
    for (const path of globSync(`${entry.name}/**/*`)) {
      // `**/*` matches directories as well as files, and a directory entry
      // has no bytes of its own to hash.
      if (!statSync(path).isFile()) continue
      files.add(path)
    }
  }

  const hash = createHash('sha256')
  for (const path of [...files].sort()) {
    hash.update(path)
    hash.update(readFileSync(path))
  }
  return hash.digest('hex')
}
