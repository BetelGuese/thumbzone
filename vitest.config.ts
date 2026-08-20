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
  },
})
