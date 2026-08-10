import { defineConfig } from 'astro/config'

export default defineConfig({
  srcDir: './site/src',
  publicDir: './site/public',
  outDir: './dist',
  // The dev toolbar's default placement is bottom-center — the exact spot
  // thumbzone's trigger occupies by design — so it intercepts pointer
  // events meant for the trigger during e2e runs. It ships dev-only and
  // never reaches production, so disabling it costs nothing there.
  devToolbar: { enabled: false },
})
