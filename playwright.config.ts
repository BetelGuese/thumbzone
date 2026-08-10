import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: 'http://localhost:4321', trace: 'on-first-retry' },
  projects: [
    { name: 'mobile-safari', use: { ...devices['iPhone 14 Pro Max'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
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
