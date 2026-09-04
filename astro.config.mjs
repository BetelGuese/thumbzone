import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://betelguese.github.io',
  // Env-gated, and set only by the Pages deployment. Every registered route
  // is root-relative, and the conformance suite drives them from the registry
  // verbatim — applying a base unconditionally would move every route in
  // `SHIPPED_SYSTEMS`, and so every per-system instance the suite runs, out
  // from under it. How many that is, is the registry's to say: a copy of the
  // count kept here could only go stale against it. Local development and the
  // suite therefore serve from the root, and the deployed site is the only
  // build that carries a base. That asymmetry is the reason
  // `site/src/lib/routes.ts` is unit tested and the deployment build is
  // checked separately: nothing the suite asserts about a route can fail for
  // the based case.
  base: process.env.TZ_BASE || undefined,
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
  integrations: [react()],
  // Tailwind 4 is a Vite plugin rather than an Astro integration, and it is
  // registered globally because that is the only place it can be. Isolation is
  // achieved by which routes import the stylesheet, not by which routes the
  // plugin is active for — see systems/shadcn/src/styles.css.
  vite: { plugins: [tailwindcss()] },
})
