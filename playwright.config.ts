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
    env: { ASTRO_DEV_BACKGROUND: '1' },
  },
})
