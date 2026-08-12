import { chromium, firefox, webkit, type BrowserType, type FullConfig, type Page } from '@playwright/test'
import { SHIPPED_SYSTEMS } from '../systems/registry'

/**
 * Loads every registered demo route before any test runs, so that no test is
 * ever a route's first visitor on a freshly started dev server.
 *
 * `playwright.config.ts` starts its own `astro dev` for every run and never
 * reuses an existing one, so every run begins with a dev server that has done
 * no on-demand work yet. Vite discovers a bare-specifier dependency only when
 * something actually requests the module that imports it; discovering one after
 * the initial crawl makes it re-run dependency pre-bundling, and re-bundling
 * ends by broadcasting a full page reload over HMR.
 *
 * That broadcast goes to *every* connected client, not only to the pages whose
 * modules changed. With `fullyParallel`, the workers that happen to be on other
 * routes at that moment — including routes with no framework dependency at all,
 * which therefore contributed nothing to the re-bundle — get reloaded out from
 * under whatever they were in the middle of. Anything holding a live execution
 * context across that instant (an in-flight `page.evaluate`, say) dies with the
 * navigation, and the test reports a destroyed context in a place that has no
 * connection to the route that triggered the re-bundle.
 *
 * Warming here empties the queue of that on-demand work while nothing is
 * watching: the reloads it provokes land on this file's own throwaway page, and
 * by the time the first test navigates anywhere the pre-bundler has nothing left
 * to discover.
 */
export default async function warmRegisteredRoutes(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL
  if (baseURL === undefined) {
    throw new Error('Cannot warm the dev server: no project declares a baseURL to resolve routes against.')
  }

  for (const engine of enginesUnderTest(config)) {
    const browser = await engine.launch()
    try {
      const page = await browser.newPage({ baseURL })
      // Twice over. One pass is enough for a dependency imported statically:
      // the page cannot reach `load` until the pre-bundler has served the
      // script that needs it, so the first pass already waits out the re-bundle
      // it provokes. It is not enough for one pulled in by a dynamic import
      // after `load` — that discovery starts a re-bundle this pass no longer
      // has anything to wait on, leaving it to finish, and broadcast, once the
      // tests' own pages are the ones connected. The second pass is the barrier
      // for that case: its dependency requests block on whatever run is still
      // in flight. Cheap, since by then there is nothing left to compile.
      await visitEveryRoute(page)
      await visitEveryRoute(page)
    } finally {
      await browser.close()
    }
  }
}

/**
 * Navigates a page through every route the conformance suite can reach.
 *
 * Read off the registry rather than listed here, so that registering a port in
 * `SHIPPED_SYSTEMS` stays the only edit a new port needs. A route missing from
 * a hand-maintained list would be exactly the one left as some test's first
 * visitor, and the symptom surfaces against an unrelated test.
 */
async function visitEveryRoute(page: Page): Promise<void> {
  for (const system of SHIPPED_SYSTEMS) {
    for (const route of [system.route, system.overflowRoute]) {
      if (route === undefined) continue

      const response = await page.goto(route, { waitUntil: 'load' })
      // A route that does not resolve warms nothing, and would otherwise leave
      // this file quietly doing no work at all while the suite went back to
      // failing intermittently somewhere else entirely.
      if (response !== null && !response.ok()) {
        throw new Error(`Cannot warm ${route}: the dev server answered ${response.status()}.`)
      }
    }
  }
}

/**
 * The distinct browser engines the configured projects run in.
 *
 * Per engine rather than once overall because "no test is a route's first
 * visitor" has to hold for the engine that test runs in: each engine gets its
 * own browsing context, and a port is free to reach for a dependency only one
 * of them needs. Derived from the projects so that adding a project covers
 * itself.
 */
function enginesUnderTest(config: FullConfig): BrowserType[] {
  const engines = { chromium, firefox, webkit }
  const names = new Set(
    config.projects.map((project) => project.use.browserName ?? project.use.defaultBrowserType ?? 'chromium'),
  )

  return [...names].map((name) => engines[name])
}
