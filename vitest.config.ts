import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `systems/` and `site/` keep source under a `src/` directory with tests
    // in a sibling `test/` one. `shared/` does not follow that shape: it has
    // no `src/` at all — its source sits at the top level and in `react/` —
    // and its tests live in `shared/test/`. That placement is load-bearing
    // twice over: it is what this file's own include globs match, and it is
    // what the vh guard in `e2e/motion-and-units.spec.ts` keys its
    // `shared/test/` exclusion to. A shared test placed anywhere else under
    // `shared/` is collected by nothing — not this config's include, and not
    // the guard's escape.
    include: [
      'core/test/**/*.test.js',
      'shared/test/**/*.test.js',
      'systems/**/test/**/*.test.js',
      'site/test/**/*.test.ts',
    ],
    environment: 'node',
    // Builds `dist` once, before any test file runs, and only when its
    // inputs have actually changed. Runs in the main process ahead of the
    // parallel workers the `include` globs above are dispatched to, which is
    // what makes it the one place `dist` is written from — see the file's
    // own header for why three test files each doing that independently
    // raced a cold `npm test` red.
    globalSetup: ['./site/test/global-setup.ts'],
  },
})
