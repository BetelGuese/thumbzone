import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Retries exist to absorb an infrastructure blip, not to launder a flaky
  // test into a green build. Without this, a test that only passes on its
  // second attempt still reports the job as successful — so an intermittent
  // failure ships, and the next person to see it has no reason to think CI
  // ever knew. Pairing the two means a retry buys a diagnosis, not silence.
  failOnFlakyTests: !!process.env.CI,
  // The default reporter (a bare 'dot' summary under CI) never writes
  // playwright-report/ at all, which would make the workflow's "upload the
  // report on failure" step upload nothing. The html reporter is what
  // actually produces that directory; kept CI-only so a local run's own
  // terminal output is unchanged.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4321', trace: 'on-first-retry' },
  // Runs after webServer is up and before the first test, which is the only
  // window in which the dev server's on-demand work can be absorbed without a
  // test's page being open to be reloaded by it. See e2e/global-setup.ts.
  globalSetup: './e2e/global-setup.ts',
  projects: [
    { name: 'mobile-safari', use: { ...devices['iPhone 14 Pro Max'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4321',
    // Always start a fresh, Playwright-managed server. Reusing whatever
    // already answers on the port would happily adopt a developer's own
    // `npm run dev` — one started without TZ_E2E below, so its dev toolbar
    // is still enabled and back to swallowing every click aimed at the
    // trigger. A stray server left running must not be able to silently
    // break the suite; failing to bind the port is a louder, clearer
    // failure than that.
    reuseExistingServer: false,
    // Astro 7 inspects how the dev server was launched and sometimes
    // silently forks `astro dev` into a background daemon, exiting the
    // foreground process Playwright is watching before the port ever opens.
    // Setting this disables only that auto-detection; an explicit
    // `--background` flag would still work as documented.
    // ASTRO_DEV_BACKGROUND is undocumented — found by reading
    // node_modules/astro/dist/cli/dev/index.js, not the public CLI docs.
    // Recheck this against that source on any Astro upgrade in case the
    // flag or the detection mechanism is renamed.
    //
    // TZ_E2E tells astro.config.mjs to disable the dev toolbar only for
    // this Playwright-managed server: its default bottom-center placement
    // sits on top of thumbzone's bottom-center trigger and swallows every
    // click aimed at it. Ordinary `npm run dev` keeps the toolbar (its
    // Audit panel is genuinely useful on an accessibility-focused project).
    env: { ASTRO_DEV_BACKGROUND: '1', TZ_E2E: '1' },
  },
})
