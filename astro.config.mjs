import { defineConfig } from 'astro/config'

export default defineConfig({
  srcDir: './site/src',
  publicDir: './site/public',
  outDir: './dist',
  // The dev toolbar's default placement is bottom-center — the exact spot
  // thumbzone's trigger occupies by design — so it intercepts pointer
  // events meant for the trigger during e2e runs. TZ_E2E is set only by
  // playwright.config.ts's webServer, so ordinary `npm run dev` keeps the
  // toolbar (its Audit panel has real value during normal development on
  // an accessibility-focused project); only the automated e2e server disables it.
  devToolbar: { enabled: !process.env.TZ_E2E },
})
