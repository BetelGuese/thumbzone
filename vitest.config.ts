import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Source lives under a `src/` directory and its tests in a sibling
    // `test/` one, which is also the line `e2e/motion-and-units.spec.ts`
    // scans along: it globs `site/src/**/*` and `systems/*/src/**/*`, so a
    // test file is deliberately outside the unit guard's reach.
    include: [
      'core/test/**/*.test.js',
      'systems/**/test/**/*.test.js',
      'site/test/**/*.test.ts',
    ],
    environment: 'node',
  },
})
