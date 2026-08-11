import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['core/test/**/*.test.js', 'systems/**/test/**/*.test.js'],
    environment: 'node',
  },
})
